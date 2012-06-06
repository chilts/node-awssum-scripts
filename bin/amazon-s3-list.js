#!/usr/bin/env node
// --------------------------------------------------------------------------------------------------------------------

var fs = require('fs');

var inspect   = require('eyes').inspector({ maxLength : 1024*1024 });
var awssum    = require('awssum');
var amazon    = awssum.load('amazon/amazon');
var S3        = awssum.load('amazon/s3').S3;

var accessKeyId     = process.env.ACCESS_KEY_ID;
var secretAccessKey = process.env.SECRET_ACCESS_KEY;
var awsAccountId    = process.env.AWS_ACCOUNT_ID;

var argv = require('optimist')
    .usage('Usage: $0 --bucket name')
    .alias('bucket', 'b')
    .demand('b')
    .describe('b', 'bucket name to get the object from')
    .describe('debug', 'to turn debugging on')
    .argv;

// --------------------------------------------------------------------------------------------------------------------

var s3 = new S3(accessKeyId, secretAccessKey, awsAccountId, amazon.US_EAST_1);

console.log( 'Settings:');
if ( argv.d || argv.debug ) {
    console.log( '- Region          : ', s3.region() );
    console.log( '- EndPoint        : ', s3.host() );
    console.log( '- AccessKeyId     : ', s3.accessKeyId() );
    console.log( '- SecretAccessKey : ', s3.secretAccessKey().substr(0,3) + "..." );
    console.log( '- AwsAccountId    : ', s3.awsAccountId() );
}

console.log( '- Bucket          : ', argv.bucket);
console.log();

// --------------------------------------------------------------------------------------------------------------------

var options = {
    BucketName : argv.bucket,
};
var fileCount = 0;
var byteCount = 0;

console.log('Listing Bucket:');
doRequest();

// --------------------------------------------------------------------------------------------------------------------

function printItems(contents) {
    contents.forEach(function(v, i) {
        console.log('' + v.LastModified + ' ' + v.ETag.substr(1, 32) + ' ' + v.Key + ' (' + v.Size + ')');
        fileCount++;
        byteCount += parseInt(v.Size, 10);
    });
}

function doRequest(marker) {
    var options = {
        BucketName : argv.bucket,
    };
    if ( marker ) {
        if ( argv.d || argv.debug ) {
            console.log('Doing request at marker ' + marker);
        }
        options.Marker = marker;
    }

    s3.ListObjects(options, function(err, data) {
        if (err) {
            inspect(err, 'Error');
            return;
        }

        if ( argv.d || argv.debug ) {
            inspect(data.StatusCode, 'StatusCode');
            inspect(data.Headers, 'Headers');
            inspect(data.Body, 'Body');
        }

        printItems(data.Body.ListBucketResult.Contents);

        if (data.Body.ListBucketResult.IsTruncated === 'true') {
            doRequest(data.Body.ListBucketResult.Contents[data.Body.ListBucketResult.Contents.length-1].Key);
        }
        else {
            // there are no more files to list
            console.log('\nTotals:');
            console.log('- Files           : ' + fileCount);
            console.log('- Size            : ' + byteCount + ' bytes');
        }
    });
}

// --------------------------------------------------------------------------------------------------------------------
