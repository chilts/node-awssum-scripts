// --------------------------------------------------------------------------------------------------------------------
//
// amazon-s3-common.js - common functions for Amazon S3
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

var fmt = require('fmt');

// --------------------------------------------------------------------------------------------------------------------

function listObjectsAll(s3, bucketname, callback) {
    var items = [];

    function doRequest(marker) {
        var options = {
            BucketName : bucketname,
        };
        if ( marker ) {
            options.Marker = marker;
        }

        fmt.field('Request', options.Marker || '[start]');
        s3.ListObjects(options, function(err, data) {
            if (err) {
                callback(err, null);
                return;
            }

            fmt.field('Items', data.Body.ListBucketResult.Contents.length);

            // loop through all the items and add them on to our saved list
            data.Body.ListBucketResult.Contents.forEach(function(v, i) {
                // remove the leading '/'
                // v.Key = v.Key.substr(1);

                // remove the extra "" around the MD5
                v.ETag = v.ETag.substr(1, 32);

                // convert the size to a number
                v.Size = parseInt(v.Size, 10);

                // now push onto the array
                items.push(v);
            });

            // if the result is truncated, fetch some more
            if (data.Body.ListBucketResult.IsTruncated === 'true') {
                doRequest(data.Body.ListBucketResult.Contents[data.Body.ListBucketResult.Contents.length-1].Key);
            }
            else {
                // all finished
                callback(null, items);
            }
        });

    }

    // start the recursion off
    doRequest();
}

// --------------------------------------------------------------------------------------------------------------------

exports.listObjectsAllMock = function(a, b, c) {
    var objects = [
        { Key : 'ToDo', Size : 142, ETag : '27b1173716f04e46b9b3ee771547c558' },
        { Key : 'README.md', Size : 1402, ETag : '145c4bb641693c5f8db8933eb4d912ba' },
        { Key : 'package.json', Size : 67, ETag : 'doesnt matter, size is different' },
    ];
    c(null, objects)
};
exports.listObjectsAll = listObjectsAll;

// --------------------------------------------------------------------------------------------------------------------
