#!/usr/bin/env node
// --------------------------------------------------------------------------------------------------------------------
//
// Copyright (c) 2012 AppsAttic Ltd - http://www.appsattic.com/
//
// Written by - Andrew Chilton
// * Email    - andychilton@gmail.com
// * Site     - http://chilts.org/
// * Blog     - http://chilts.org/blog/
// * Twitter  - https://twitter.com/andychilton
//
// License: http://opensource.org/licenses/MIT
//
// --------------------------------------------------------------------------------------------------------------------

var fs = require('fs');
var exec = require('child_process').exec
var util = require('util');

var inspect = require('eyes').inspector();
var async = require('async');
var nconf = require('nconf');
var osenv = require('osenv');
var Seq   = require('seq');
var oibackoff = require('oibackoff');

var awssum     = require('awssum');
var amazon     = awssum.load('amazon/amazon');
var CloudWatch = awssum.load('amazon/cloudwatch').CloudWatch;
var Imd        = awssum.load('amazon/imd').Imd;

// --------------------------------------------------------------------------------------------------------------------

var KILO = 1024;
var MEGA = 1048576;
var GIGA = 1073741824;

var hostname;
var instanceId;
var region;
var availZone;
var home = process.env.HOME;
var stats = {};
var data = {
    'Namespace'  : 'System/Linux',
    'MetricData' : [],
};
var timestamp = (new Date()).toISOString();
var verbose;

function msg() {
    if ( verbose ) {
        console.log.apply(null, arguments);
    }
};

function dump(name, data) {
    if ( verbose ) {
        console.log(name + ' : ' + util.inspect(data, false, null, true));
    }
}

function li(msg) {
    if ( verbose ) {
        console.log('* ' + msg);
    }
}

// backoff strategy
var backoff = oibackoff.backoff({
    'algorithm'  : 'exponential',
    'delayRatio' : 0.2,
    'maxTries'   : 3,
});

// --------------------------------------------------------------------------------------------------------------------

// top ones take precendence over lower ones (hence the default is at the bottom)
nconf
    .argv()
    .env()
    .file({ file: osenv.home() + '/.awssum' })
    .defaults({
        'test'    : false,
        'verbose' : false,
        'memory'  : false,
        'swap'    : false,
    });

// get a few things from the config
verbose = nconf.get('verbose');

// firstly, do a few things in order to start off with

Seq()
    .seq(getInstanceId)
    .seq(getRegion)
    .seq(getHostname)
    .seq(gatherMemInfo)
    .seq(gatherDiskInfo)
    .seq(sendMetrics)
    .catch(function(err) {
        console.error(err.stack ? err.stack : err);
    })
;

// --------------------------------------------------------------------------------------------------------------------
// all functions which deal with sequences or queues

function getInstanceId() {
    msg('Getting instance id ...');

    var next = this;

    var imd = new Imd();
    imd.Get({
        Category : '/meta-data/instance-id',
        Version  : 'latest',
    }, function(err, data) {
        if (err) {
            console.error("Can't get instance-id");
            next();
            return;
        }
        instanceId = data.Body;
        msg('Getting instance id ... ' + instanceId);
        next();
    });
}

function getRegion() {
    msg('Getting availability zone ...');

    var next = this;

    var imd = new Imd();
    imd.Get({
        Category : '/meta-data/placement/availability-zone',
        Version  : 'latest',
    }, function(err, data) {
        if (err) {
            console.error("Can't get availability zone");
            next();
            return;
        }
        availZone = data.Body;
        region = availZone.substr(0, availZone.length-1);
        msg('Getting availability zone ... ' + availZone);
        msg('Regions is ' + region);
        next();
    });
}

function getHostname() {
    msg('Getting hostname ...');

    var next = this;
    exec('hostname', function (err, output, stderr) {
        if (err) {
            next(err);
            return;
        }
        hostname = output.trim();
        msg('Getting hostname ... ' + hostname);
        next();
    });
}

function gatherMemInfo() {
    var next = this;

    if ( !nconf.get('memory') && !nconf.get('swap') ) {
        next();
        return;
    }

    msg('Reading /proc/meminfo ...');
    fs.readFile('/proc/meminfo', function(err, data) {
        msg('Reading /proc/meminfo ... done');
        if (err) {
            next(err);
            return;
        }

        // loop through all the lines so we can parse them
        var info = data.toString('utf8').split('\n');
        info.forEach(function(v, i) {
            var fields = v.split(/\s+/);

            if ( fields.length === 2 ) {
                var field = fields[0].substr(0, fields[0].length-1);
                stats[field] = {
                    'field' : field,
                    'value' : parseInt(fields[1]),
                };
            }
            else if ( fields.length === 3 ) {
                var field = fields[0].substr(0, fields[0].length-1);
                stats[field] = {
                    'field' : field,
                    'value' : parseInt(fields[1]),
                    'units' : fields[2],
                };
            }
            else {
                // unknown field format, ignoring
            }
        });

        // let's calculate a few things and push them onto the metrics
        var memTotal = stats.MemTotal.value;
        var memFree = stats.MemFree.value;
        var memCached = stats.Cached.value;
        var memBuffers = stats.Buffers.value;
        var memAvail = memFree + memCached + memBuffers;
        var memUsed = memTotal - memAvail;
        var swapTotal = stats.SwapTotal.value;
        var swapFree = stats.SwapFree.value;
        var swapUsed = swapTotal - swapFree;

        // put these onto the data to send to CloudWatch
        var memUtil = 0;
        if ( memTotal > 0 ) {
            memUtil = 100 * memUsed / memTotal;
        }
        if ( nconf.get('memory') ) {
            appendMetricData('MemoryUtilization', 'Percent', memUtil);
            appendMetricData('MemoryUsed', 'Kilobytes', memUsed);
            appendMetricData('MemoryAvailable', 'Kilobytes', memAvail);
        }

        var swapUtil = 0;
        if ( swapTotal > 0 ) {
            swapUtil = 100 * swapUsed / swapTotal;
        }
        if ( nconf.get('swap') ) {
            appendMetricData('SwapUtilization', 'Percent', swapUtil);
            appendMetricData('SwapUsed', 'Kilobytes', swapUsed);
        }

        next();
    });
}

function gatherDiskInfo() {
    var next = this;

    if ( !nconf.get('disk') ) {
        next();
        return;
    }

    msg('Gathering Disk Info:');

    var disks = nconf.get('disk');
    if ( typeof disks === 'string' ) {
        disks = [ disks ];
    }

    var sequence = Seq();
    disks.forEach(function(path, i) {
        li('mount point = ' + path);
        sequence.seq(function() {
            var nextDiskInfo = this;

            exec('df -k -l -P ' + path, function (err, output, stderr) {
                if (err) {
                    nextDiskInfo(err);
                    return;
                }

                // discard first line, then split on spaces to get the fields
                var info = output.split('\n')[1].split(/\s+/);

                // Result of df is reported in 1k blocks
                var diskTotal = info[1] * KILO / MEGA;
                var diskUsed  = info[2] * KILO / MEGA;
                var diskAvail = info[3] * KILO / MEGA;
                var fsystem   = info[0];
                var mount     = info[5];

                var diskUtil = 0;
                if ( diskTotal > 0 ) {
                    diskUtil = 100 * diskUsed / diskTotal;
                }
                appendMetricDataDisk('DiskSpaceUtilization', 'Percent',   diskUtil,  fsystem, mount);
                appendMetricDataDisk('DiskSpaceUsed',        'Megabytes', diskUsed,  fsystem, mount);
                appendMetricDataDisk('DiskSpaceAvailable',   'Megabytes', diskAvail, fsystem, mount);

                nextDiskInfo();
            });
        });
    });

    sequence.seq(function() {
        // calls this sequence
        this();
        // calls the next _overall_ sequence
        next();
    });

    // if any of the df's go wrong, just pass it back up to the next()
    sequence.catch(next);
}

function sendMetrics() {
    var next = this;

    // if there are no metrics, then just finish up
    if ( data.MetricData.length === 0 ) {
        msg('Nothing to send to CloudWatch');
        next();
        return;
    }

    var cw = new CloudWatch({
        'accessKeyId'     : nconf.get('ACCESS_KEY_ID'),
        'secretAccessKey' : nconf.get('SECRET_ACCESS_KEY'),
        'region'          : region || 'us-east-1',
    });

    function send(callback) {
        cw.PutMetricData(data, callback);
    }

    msg('Performing PutMetricData ...');
    backoff(send, function(err, data, priorErrors) {
    msg('Performing PutMetricData ... done');
        if (err) {
            console.error("Can't PutMetricData : ", err);
            console.error("PriorErrors         : ", err);
            inspect(err, "Can't PutMetricData : ");
            inspect(err, "PriorErrors         : ");
            next();
            return;
        }
        dump('data', data);
        next();
    });
}

// --------------------------------------------------------------------------------------------------------------------

function makeMetric(name, unit, value) {
    // create the metric to send to CloudWatch
    var metric = {
        MetricName : name,
        Unit       : unit,
        Value      : value,
        Timestamp  : timestamp,
        Dimensions : [],
    };

    // set some dimensions, firstly the instanceId or the hostname
    if ( instanceId ) {
        metric.Dimensions.push({
            Name  : 'InstanceId',
            Value : instanceId,
        });
    }
    else {
        metric.Dimensions.push({
            Name  : 'Hostname',
            Value : hostname,
        });
    }

    return metric;
}

function appendMetricData(name, unit, value, filesystem, mountPath) {
    msg('Appending [' + name + ': ' + value + ' ' + unit + ']');

    var metric = makeMetric(name, unit, value);

    // push onto the options we're sending
    data.MetricData.push(metric);
}

function appendMetricDataDisk(name, unit, value, filesystem, mountPath) {
    msg('Appending [' + name + ': ' + value + ' ' + unit + '] for ' + mountPath);
    var metric = makeMetric(name, unit, value);

    // if this is for a filesystem, set this dimension too
    if ( filesystem ) {
        metric.Dimensions.push({
            Name  : 'Filesystem',
            Value : filesystem,
        });
    }

    // if this has a mountpoint
    if ( mountPath ) {
        metric.Dimensions.push({
            Name  : 'MountPath',
            Value : mountPath,
        });
    }

    // push onto the options we're sending
    data.MetricData.push(metric);
}

// --------------------------------------------------------------------------------------------------------------------
