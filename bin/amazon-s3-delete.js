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
    .usage('Usage: $0 --bucket name [files...]')

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
fmt.title('amazon-s3-sync-up.js');
fmt.field('Bucket', argv.bucket);
fmt.line();

// --------------------------------------------------------------------------------------------------------------------

// set up some queues which we can put things onto
var s3Objects = {};
var deleteObjectQueue = async.queue(deleteObject, argv.concurrency);
var deleteFileQueue   = async.queue(deleteFile,   argv.concurrency);

// put all the files onto the first queue to delete
argv._.forEach(function(filename, i) {
    deleteObjectQueue.push(filename);
});

function deleteObject(filename, callback) {
    var opts = {
        'BucketName' : argv.bucket,
        'ObjectName' : filename,
    };

    s3.DeleteObject(opts, function(err, data) {
        if (err) {
            fmt.field('ObjectDeleteFailed', filename);
            callback();
            return;
        }

        deleteFileQueue.push(filename);
        callback();
    })
}

function deleteFile(filename, callback) {
    fs.unlink(filename, function(err) {
        if (err) {
            fmt.field('FileDeleteFailed', filename);
            callback();
            return;
        }

        fmt.field('Deleted', filename);
        callback();
    });
}

// --------------------------------------------------------------------------------------------------------------------
