#!/usr/bin/env node
// --------------------------------------------------------------------------------------------------------------------

var fs = require('fs');

var inspect   = require('eyes').inspector();
var awssum    = require('awssum');
var amazon    = awssum.load('amazon/amazon');
var S3        = awssum.load('amazon/s3');

var accessKeyId     = process.env.ACCESS_KEY_ID;
var secretAccessKey = process.env.SECRET_ACCESS_KEY;
var awsAccountId    = process.env.AWS_ACCOUNT_ID;

var argv = require('optimist')
    .usage('Usage: $0 --bucket name --object name --filename filename.txt')
    .alias('bucket', 'b')
    .alias('object', 'o')
    .alias('filename', 'f')
    .demand('b')
    .demand('o')
    .demand('f')
    .describe('b', 'bucket name to get the object from')
    .describe('o', 'object to download')
    .describe('f', 'where to save this obect')
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
console.log( '- Object          : ', argv.object);
console.log( '- Filename        : ', argv.filename);
console.log();

// --------------------------------------------------------------------------------------------------------------------

var options = {
    BucketName : argv.bucket,
    ObjectName : argv.object,
};

console.log('Getting Object:');
s3.GetObject(options, function(err, data) {
    if (err) {
        inspect(err, 'Error');
        return;
    }

    if ( argv.d || argv.debug ) {
        inspect(data.StatusCode, 'StatusCode');
        inspect(data.Headers, 'Headers');
    }

    // since this is an example program, just write the file out Sync
    var fd = fs.openSync(argv.filename, 'w+');
    fs.writeSync(fd, data.Body, 0, data.Body.length, 0);
    fs.closeSync(fd);
});

// --------------------------------------------------------------------------------------------------------------------
