#!/usr/bin/env node
// --------------------------------------------------------------------------------------------------------------------

var fs = require('fs');
var crypto = require('crypto');

var fmt = require('fmt');
var async = require('async');
var tmp = require('tmp');
var mkdirp = require('mkdirp');
var walk = require('walkdir');

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
fmt.title('amazon-s3-sync-up.js');
fmt.field('Bucket', argv.bucket);
fmt.field('Concurrency', argv.concurrency);
fmt.line();

// --------------------------------------------------------------------------------------------------------------------

// set up some queues which we can put things onto
var s3Objects = {};
var checkFileIsInS3Queue = async.queue(checkFileIsInS3, argv.concurrency);
var uploadItemQueue      = async.queue(uploadItem,      argv.concurrency);
var checkMd5IsSameQueue  = async.queue(checkMd5IsSame,  argv.concurrency);

// firstly, list all objects in the bucket
common.listObjectsAll(s3, argv.bucket, function(err, objects) {
    if (err) {
        fmt.field('Error', err);
        return;
    }

    // save these objects into the s3Objects global
    objects.forEach(function (object, i) {
        s3Objects[object.Key] = object;
    });

    // get all the files in this directory down
    fmt.field('WalkingDir', 'Started');
    var emitter = walk('./');

    emitter.on('file', function(filename, stat) {
        var relativeFile = filename.substr(process.cwd().length + 1);

        // ignore backup files
        if ( relativeFile.match(/~$/) ) {
            fmt.field('IgnoringBackup', relativeFile);
            return;
        }

        // ignore .dotfiles files
        if ( relativeFile.match(/^\./) ) {
            fmt.field('IgnorningDotFile', relativeFile);
            return;
        }

        // push to the next queue
        checkFileIsInS3Queue.push({
            'filename' : relativeFile,
            'size'     : stat.size,
        });
    });

    emitter.on('end', function() {
        // console.log('Entire directory has been walked.');
        fmt.field('WalkingDir', 'Finished');
    });
});

// --------------------------------------------------------------------------------------------------------------------

function checkFileIsInS3(item, callback) {
    // firstly, see if the item is in S3
    if ( !s3Objects[item.filename] ) {
        // not in S3, so add to the queue to upload
        uploadItemQueue.push(item);
        callback();
        return;
    }

    // item _is_ in S3, check the lengths are the same
    if ( s3Objects[item.filename].Size !== item.size ) {
        fmt.field('SizeMismatch', item.filename + ' (file=' + item.size + ', object=' + s3Objects[item.filename].Size + ')');
        callback();
        return;
    }

    // filename and S3 object are the same size, check the MD5 of the file
    checkMd5IsSameQueue.push(item);
    callback();
}

function checkMd5IsSame(item, callback) {
    // get the MD5 of this file (we know it exists)
    fs.readFile(item.filename, function(err, data) {
        // get the MD5 of this file
        var md5 = crypto.createHash('md5');
        md5.update(data);
        var md5hex = md5.digest('hex');

        // check if the calculated MD5 is the same as the ETag in the S3 item
        if ( md5hex !== s3Objects[item.filename].ETag ) {
            // different, just tell the user they are different
            fmt.field('MD5Mismatch', item.filename + ' (file=' + md5hex + ', object=' + s3Objects[item.filename].ETag + ')');
        }
        callback();
    });
}

function uploadItem(item, callback) {
    fmt.field('Uploading', item.filename);

    // create a read stream
    var bodyStream = fs.createReadStream( item.filename );

    var options = {
        BucketName    : argv.bucket,
        ObjectName    : item.filename,
        ContentLength : item.size,
        Body          : bodyStream,
    };

    s3.PutObject(options, function(err, data) {
        if (err) {
            fmt.field('UploadFailed', item.filename);

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
