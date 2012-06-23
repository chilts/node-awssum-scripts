#!/usr/bin/env node
// --------------------------------------------------------------------------------------------------------------------

var fs = require('fs');
var crypto = require('crypto');

var fmt = require('fmt');
var async = require('async');
var tmp = require('tmp');
var mkdirp = require('mkdirp');

var awssum    = require('awssum');
var amazon    = awssum.load('amazon/amazon');
var S3        = awssum.load('amazon/s3').S3;
var common    = require('../lib/amazon-s3-common.js');

var accessKeyId     = process.env.ACCESS_KEY_ID;
var secretAccessKey = process.env.SECRET_ACCESS_KEY;
var awsAccountId    = process.env.AWS_ACCOUNT_ID;

// --------------------------------------------------------------------------------------------------------------------

var argv = require('optimist')
    .usage('Usage: $0 --bucket name [--concurrency n]')

    .demand('b')
    .alias('b', 'bucket')
    .describe('b', 'bucket to sync with')

    .alias('c', 'concurrency')
    .default('c', 3)
    .describe('c', 'concurrency level for uploads/downloads')

    .describe('debug', 'to turn debugging on')
    .argv;

// --------------------------------------------------------------------------------------------------------------------

var s3 = new S3({
    accessKeyId     : accessKeyId,
    secretAccessKey : secretAccessKey,
    awsAccountId    : awsAccountId,
    region          : amazon.US_EAST_1
});

fmt.sep();
fmt.title('amazon-s3-sync-down.js');
fmt.field('Bucket', argv.bucket);
fmt.field('Concurrency', argv.concurrency);
fmt.line();

// set up some queues so that we can get, check and download objects from S3 Buckets
var checkItemIsLocalQueue    = async.queue(checkItemIsLocal, argv.concurrency);
var checkMd5IsSameQueue      = async.queue(checkMd5IsSame, argv.concurrency);
// seems to have weird interactions if called more than once at a time
var checkLocalDirExistsQueue = async.queue(checkLocalDirExists, 1);
var createTmpFileQueue       = async.queue(createTmpFile, argv.concurrency);
var downloadItemQueue        = async.queue(downloadItem, argv.concurrency);

common.listObjectsAll(s3, argv.bucket, function(err, objects) {
    if (err) {
        fmt.field('Error', err);
        return;
    }

    fmt.field('ObjectCount', objects.length);
    fmt.line();

    // now that we have the list, we can start checking to see if each of these objects is also local
    objects.forEach(function(item, i) {
        // ignore any keys that look like directories (the ones that the Amazon AWS Console creates)
        if ( item.Size === 0 && item.Key.charAt(item.Key.length-1) === '/' ) {
            fmt.field('IgnoringDirKey', item.Key);
            return;
        }

        checkItemIsLocalQueue.push(item);
    });

    // we can also start reading all the directories and c
});

// --------------------------------------------------------------------------------------------------------------------

function checkItemIsLocal(item, callback) {
    // firstly, check if the file exists
    fs.stat(item.Key, function(err, stats) {
        if ( err ) {
            // this file doesn't exist locally, so push it onto the download queue
            checkLocalDirExistsQueue.push(item);
            callback();
            return;
        }

        // ok, we know there is a file, but if the filesize is different, it needs to go on the output queue
        if ( stats.size !== item.Size ) {
            fmt.field('SizeMismatch', item.Key + ' (file=' + stats.size + ', item=' + item.Size + ')');
            // we can't reconcile this file, the user will have to do it
            callback();
            return;
        }

        // filesizes are the same, so check the MD5s are the same
        checkMd5IsSameQueue.push(item);
        callback();
    });
}

function checkMd5IsSame(item, callback) {
    // get the MD5 of this file (we know it exists)
    fs.readFile(item.Key, function(err, data) {
        if (err) {
            fmt.field('Error', err);
            return;
        }

        // get the MD5 of this file
        var md5;

        // get the MD5 of this file
        var md5 = crypto.createHash('md5');
        md5.update(data);
        var md5hex = md5.digest('hex');

        // check if the calculated MD5 is the same as the ETag in the S3 item
        if ( item.ETag !== md5hex ) {
            // different, just tell the user they are different
            fmt.field('MD5Mismatch', item.Key + ' (object=' + item.ETag + ', file=' + md5hex + ')');
        }
        callback();
    });
}

var dirCache = {};
function checkLocalDirExists(item, callback) {
    // just make sure this directory exists
    var dirname = item.Key.substr(0, item.Key.lastIndexOf('/'));

    fs.stat(dirname, function(err, stats) {
        if ( err ) {
            // nothing here
            mkdirp(dirname, function (err) {
                if ( err ) {
                    fmt.field('ErrMakingDir', err);
                    callback();
                    return;
                }
                createTmpFileQueue.push(item);
                callback();
            });
            return;
        }

        if ( !stats.isDirectory() ) {
            fmt.field('NotADirectory', dirname + '/');
            callback();
            return;
        }

        // all fine
        createTmpFileQueue.push(item);
        callback();
    });
}

function createTmpFile(item, callback) {
    tmp.file({ template : '/tmp/tmp-XXXXXXXX.' + process.pid }, function(err, tmpfile, fd) {
        if ( err ) {
            fmt.field('TmpFileError', err);
            callback();
            return;
        }

        // save these details onto the item
        item.tmpfile = tmpfile;
        item.fd = fd;

        // add to the download queue
        downloadItemQueue.push(item);
        callback();
    });
}

function downloadItem(item, callback) {
    var options = {
        BucketName : argv.bucket,
        ObjectName : item.Key,
    };
    s3.GetObject(options, function(err, data) {
        if (err) {
            fmt.field('ErrorDownloading', err);
            callback();
            return;
        }

        fs.write(item.fd, data.Body, 0, data.Body.length, 0, function(err, written, buffer) {
            if ( err ) {
                fmt.field('ErrWritingFile', err);
                callback();
                return;
            }

            // all ok, now close the file
            fs.close(item.fd, function(err) {
                if ( err ) {
                    fmt.field('ErrClosingFile', err);
                    callback();
                    return;
                }

                // finally, let's move it into place
                fs.rename(item.tmpfile, item.Key, function(err) {
                    if ( err ) {
                        fmt.field('ErrRenamingTmpFileToKey', err);
                        callback();
                        return;
                    }

                    fmt.field('FileSaved', item.tmpfile + ' -> ' + item.Key);

                    // absolutely everything went positively well!
                    callback();
                });
            });
        });
    });
}

function s3BucketList(bucket, callback) {
    var items = [];

    function doRequest(marker) {
        var options = {
            BucketName : argv.bucket,
        };
        if ( marker ) {
            fmt.field('S3ListObjects', 'New request at marker ' + marker);
            if ( argv.d || argv.debug ) {
                console.log('Doing request at marker ' + marker);
            }
            options.Marker = marker;
        }
        else {
            fmt.field('S3ListObjects', 'Initial request');
        }

        s3.ListObjects(options, function(err, data) {
            if (err) {
                console.log('Error:', err);
                process.exit(1);
            }

            // loop through all the items and add them on to our saved list
            data.Body.ListBucketResult.Contents.forEach(function(v, i) {
                items.push(v);
            });

            // if we have any more, call
            if (data.Body.ListBucketResult.IsTruncated === 'true') {
                doRequest(data.Body.ListBucketResult.Contents[data.Body.ListBucketResult.Contents.length-1].Key);
            }
            else {
                // all finished
                callback(items);
            }
        });

    }

    // start the recursion off
    doRequest();
}

// --------------------------------------------------------------------------------------------------------------------
