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

var async = require('async');
var nconf = require('nconf');
var osenv = require('osenv');
var Seq   = require('seq');

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
var opts = {
    'Namespace'  : 'System/Linux',
    'MetricData' : [],
};
var timestamp = (new Date()).toISOString();
var verbose;

function msg(str) {
    if ( verbose ) {
        console.log(str);
    }
};

function dump(name, data) {
    if ( verbose ) {
        console.log(name + '=' + util.inspect(data, false, null, true));
    }
}

function li(msg) {
    if ( verbose ) {
        console.log('* ' + msg);
    }
}

// --------------------------------------------------------------------------------------------------------------------

// top ones take precendence over lower ones (hence the default is at the bottom)
nconf
    .argv()
    .env()
    .file({ file: osenv.home() + '/.awssum' })
    .defaults({
        'test'               : false,
        'concurrency'        : 10,
        'verbose'            : false,
        'memory-utilization' : false,
        'memory-used'        : false,
        'memory-available'   : false,
        'swap-utilization'   : false
        'swap-used'          : false,
    });

// get a few things from the config
verbose = nconf.get('verbose');

// firstly, do a few things in order to start off with

Seq()
    .seq(getInstanceId)
    .seq(getRegion)
    .seq(getHostname)
    .seq(readProcMemInfo)
    .seq(extractMemStats)
    .seq(printOpts)
    .seq(sendMetrics)
    .catch(function(err) {
        console.error(err.stack ? err.stack : err);
    })
;

// var cloudwatch = new CloudWatch({
//     accessKeyId     : accessKeyId,
//     secretAccessKey : secretAccessKey,
//     awsAccountId    : awsAccountId,
//     region          : amazon.US_EAST_1
// });

// --------------------------------------------------------------------------------------------------------------------
// all functions which deal with sequences or queues

function getInstanceId() {
    msg('Getting instance id');

    var next = this;

    var imd = new Imd();
    imd.Get({
        Category : '/meta-data/instance-id',
        Version  : 'latest',
    }, function(err, data) {
        if (err) {
            console.log("Can't get instance-id");
            next();
            return;
        }
        instanceId = data.Body;
        msg('InstanceId=' + instanceid);
        next();
    });
}

function getRegion() {
    msg('Getting availability zone');

    var next = this;

    var imd = new Imd();
    imd.Get({
        Category : '/meta-data/placement/availability-zone',
        Version  : 'latest',
    }, function(err, data) {
        if (err) {
            console.log("Can't get availability zone");
            next();
            return;
        }
        availZone = data.Body;
        region = availZone.substr(0, availZone.length-1);
        msg('availZone=' + availZone);
        msg('region=' + region);
        next();
    });
}

function getHostname() {
    msg('Getting hostname');

    var next = this;
    exec('hostname', function (err, output, stderr) {
        if (err) {
            next(err);
            return;
        }
        hostname = output.trim();
        msg('Hostname=' + hostname);
        next();
    });
}

function readProcMemInfo() {
    msg('Reading /proc/meminfo');

    var next = this;
    fs.readFile('/proc/meminfo', function(err, data) {
        msg('Read /proc/meminfo ok');
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

        next();
    });
}

function appendMetricData(name, unit, value, filesystem, mountPath) {
    msg('Appending [' + name + ': ' + value + ' ' + unit + '] to metrics');

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
            Value : mount,
        });
    }

    // push onto the options we're sending
    opts.MetricData.push(metric);
}

function extractMemStats() {
    msg('Extracting mem stats');

    var next = this;

    var memTotal = stats.MemTotal.value;
    var memFree = stats.MemFree.value;
    var memCached = stats.Cached.value;
    var memBuffers = stats.Buffers.value;
    var memAvail = memFree + memCached + memBuffers;
    var memUsed = memTotal - memAvail;
    var swapTotal = stats.SwapTotal.value;
    var swapFree = stats.SwapFree.value;
    var swapUsed = swapTotal - swapFree;

    li('memTotal=' + memTotal);
    li('memFree=' + memFree);
    li('memCached=' + memCached);
    li('memBuffers=' + memBuffers);
    li('memAvail=' + memAvail);
    li('memUsed=' + memUsed);
    li('swapTotal=' + swapTotal);
    li('swapFree=' + swapFree);
    li('swapUsed=' + swapUsed);

    // put these onto the opts to send to CloudWatch
    var memUtil = 0;
    if ( memTotal > 0 ) {
        memUtil = 100 * memUsed / memTotal;
    }
    if ( nconf.get('memory-utilization') ) {
        appendMetricData('MemoryUtilization', 'Percent', memUtil);
    }
    if ( nconf.get('memory-used') ) {
        appendMetricData('MemoryUsed', 'Kilobytes', memUsed);
    }
    if ( nconf.get('memory-available') ) {
        appendMetricData('MemoryAvailable', 'Kilobytes', memAvail);
    }

    var swapUtil = 0;
    if ( swapTotal > 0 ) {
        swapUtil = 100 * swapUsed / swapTotal;
    }
    if ( nconf.get('swap-utilization') ) {
        appendMetricData('SwapUtilization', 'Percent', swapUtil);
    }
    if ( nconf.get('swap-used') ) {
        appendMetricData('SwapUsed', 'Kilobytes', swapUsed);
    }

    next();
}

function printOpts() {
    var next = this;
    dump('opts', opts);
    next();
}

function sendMetrics() {
    var next = this;

    var cw = new CloudWatch({
        'accessKeyId'     : nconf.get('ACCESS_KEY_ID'),
        'secretAccessKey' : nconf.get('SECRET_ACCESS_KEY'),
        'region'          : region || 'us-east-1',
    });
    cw.PutMetricData(opts, function(err, data) {
        if (err) {
            console.log("Can't PutMetricData " + err);
            next();
            return;
        }
        dump('data', data);
        next();
    });
}

// --------------------------------------------------------------------------------------------------------------------
