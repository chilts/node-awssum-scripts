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
    .describe('b', 'bucket to find duplicates in')

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
fmt.line();

// --------------------------------------------------------------------------------------------------------------------

var md5 = {};
common.listObjectsAll(s3, argv.bucket, function(err, objects) {
    if (err) {
        fmt.field('Error', err);
        return;
    }

    fmt.field('ObjectCount', objects.length);
    fmt.line();

    // now that we have the list, we can start checking to see if each of these objects is also local
    objects.forEach(function(item, i) {
        // fmt.field('ETag', item.ETag);
        if ( !md5[item.ETag] ) {
            md5[item.ETag] = [];
        }
        md5[item.ETag].push(item);
    });

    // go through all the keys
    for ( var key in md5 ) {
        if ( md5[key].length !== 1 ) {
            fmt.field('Duplicate', key + ' = ' + md5[key].length);
            md5[key].forEach(function(item, i) {
                fmt.field('* Object', item.Key);
            });
        }
    }
    fmt.line();
});

// --------------------------------------------------------------------------------------------------------------------
