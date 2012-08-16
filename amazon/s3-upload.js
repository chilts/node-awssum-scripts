#!/usr/bin/env node
// --------------------------------------------------------------------------------------------------------------------

var fs = require('fs');

var fmt = require('fmt');
var async = require('async');
var inspect   = require('eyes').inspector();

var awssum    = require('awssum');
var amazon    = awssum.load('amazon/amazon');
var S3        = awssum.load('amazon/s3').S3;

var accessKeyId     = process.env.ACCESS_KEY_ID;
var secretAccessKey = process.env.SECRET_ACCESS_KEY;
var awsAccountId    = process.env.AWS_ACCOUNT_ID;

// --------------------------------------------------------------------------------------------------------------------

var argv = require('optimist')
    .usage('Usage: $0 --bucket name [--concurrency n] [files...]')

    .alias('bucket', 'b')
    .demand('b')
    .describe('b', 'bucket name to store upload')

    .alias('c', 'concurrency')
    .default('c', 3)
    .describe('c', 'concurrency level for uploads/downloads')

    .describe('debug', 'to turn debugging on')

    .argv;

// --------------------------------------------------------------------------------------------------------------------

fmt.sep();
fmt.title('amazon-s3-upload.js');
fmt.field('Bucket', argv.bucket);
fmt.field('Concurrency', argv.concurrency);
fmt.field('Files', argv._.length);
fmt.line();

// --------------------------------------------------------------------------------------------------------------------

var s3 = new S3({
    accessKeyId     : accessKeyId,
    secretAccessKey : secretAccessKey,
    awsAccountId    : awsAccountId,
    region          : amazon.US_EAST_1
});

// only upload the files that do not exist (unless --force is active)
// var checkItemDoesNotExistQueue = async.queue(checkItemDoesNotExist, args.concurrency);
// var checkMd5IsSameQueue = async.queue(checkMd5IsSame, args.concurrency);
var statItemQueue   = async.queue(statItem,   argv.concurrency);
var uploadItemQueue = async.queue(uploadItem, argv.concurrency);
uploadItemQueue.drain = function() {
    fmt.line();
    fmt.title('Finished');
    fmt.field('UploadedFiles', argv._.length);
    fmt.sep();
};

// for all the files given on the command line, add them to the first queue
argv._.forEach(function(filename, i) {
    statItemQueue.push({
        'filename' : filename,
    });
});

// --------------------------------------------------------------------------------------------------------------------

function statItem(item, callback) {
    // firstly, check if the file exists
    fs.stat(item.filename, function(err, stats) {
        if ( err ) {
            // this file doesn't exist so we can't upload it
            fmt.field('FileNotExist', item.filename);
            callback();
            return;
        }

        // we know there is a file
        item.size = stats.size;

        // add it to the upload queue
        uploadItemQueue.push(item);
        callback();
    });
}

function uploadItem(item, callback) {
    // create a read stream
    var bodyStream = fs.createReadStream( item.filename );

    var options = {
        BucketName    : argv.bucket,
        ObjectName    : item.filename,
        ContentLength : item.size,
        Body          : bodyStream
    };

    fmt.field('Uploading', item.filename + ' (' + item.size + ')');
    s3.PutObject(options, function(err, data) {
        if (err) {
            fmt.field('UploadFailed', item.filename);
            console.log(err);

            // put this item back on the queue if retries is less than the cut-off
            if ( item.retries > 2 ) {
                fmt.field('UploadCancelled', item.filename);
            }
            else {
                // try again
                item.retries = item.retries ? item.retries+1 : 1;
                uploadItemQueue.push(item);
            }

            callback();
            return;
        }

        fmt.field('Uploaded', item.filename);
        callback();
    });
}

// --------------------------------------------------------------------------------------------------------------------
