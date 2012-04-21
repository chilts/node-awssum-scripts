#!/usr/bin/env node
// --------------------------------------------------------------------------------------------------------------------

var fs = require('fs');

var inspect   = require('eyes').inspector();
var awssum    = require('awssum');
var amazon    = awssum.load('amazon/amazon');
var s3Service = awssum.load('amazon/s3');

var accessKeyId     = process.env.ACCESS_KEY_ID;
var secretAccessKey = process.env.SECRET_ACCESS_KEY;
var awsAccountId    = process.env.AWS_ACCOUNT_ID;

var argv = require('optimist')
    .usage('Usage: $0 --bucket name --filename filename.txt')
    .alias('bucket', 'b')
    .alias('filename', 'f')
    .demand('b')
    .demand('f')
    .describe('b', 'bucket name to store upload')
    .describe('f', 'name of file to upload')
    .describe('debug', 'to turn debugging on')
    .argv;

// --------------------------------------------------------------------------------------------------------------------

var s3 = new s3Service(accessKeyId, secretAccessKey, awsAccountId, amazon.US_EAST_1);

console.log( 'Settings:');
if ( argv.d || argv.debug ) {
    console.log( '- Region          : ', s3.region() );
    console.log( '- EndPoint        : ', s3.host() );
    console.log( '- AccessKeyId     : ', s3.accessKeyId() );
    console.log( '- SecretAccessKey : ', s3.secretAccessKey().substr(0,3) + "..." );
    console.log( '- AwsAccountId    : ', s3.awsAccountId() );
}

console.log( '- Bucket          : ', argv.bucket);
console.log( '- Filename        : ', argv.filename);
console.log();

// --------------------------------------------------------------------------------------------------------------------

console.log('Statting File:');
fs.stat(argv.filename, function(err, file_info) {
    if (err) {
        inspect(err, 'Error');
        return;
    }
    console.log('- Size            : ', file_info.size);
    console.log('- uid             : ', file_info.uid);
    console.log('- gid             : ', file_info.gid);
    console.log('- inode           : ', file_info.ino);
    console.log('- ctima           : ', file_info.ctime);
    console.log('- mtime           : ', file_info.mtime);
    console.log();

    // create a read stream
    var bodyStream = fs.createReadStream( argv.filename );

    var options = {
        BucketName : argv.bucket,
        ObjectName : argv.filename,
        ContentLength : file_info.size,
        Body : bodyStream
    };

    console.log('Putting Object:');
    s3.PutObject(options, function(err, data) {
        if (err) {
            inspect(err, 'Error');
            return;
        }

        console.log('- Date            : ', data.Headers.date);
        console.log('- Request Id      : ', data.Headers['x-amz-request-id']);
        console.log('- Etag            : ', data.Headers.etag);

        if ( argv.d || argv.debug ) {
            console.log('- StatusCode      : ', data.StatusCode);
            console.log('- Headers         : ');
            inspect(data.Headers);
        }
    });
});

// --------------------------------------------------------------------------------------------------------------------
