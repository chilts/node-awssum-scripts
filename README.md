# node-awssum-scripts #

Examples of non-trivial scripts for node-awssum which can be used standalone.

## Usage ##

    $ git clone https://github.com/appsattic/node-awssum-scripts.git
    $ cd node-awssum-scripts
    $ npm install -d

Then, depending on your service, you need to export a couple of environment variables.

    $ export ACCESS_KEY_ID=4CCE55...........K3Y
    $ export SECRET_ACCESS_KEY=s3kr1t
    $ export AWS_ACCOUNT_ID=1234....4321

Then, try an example below. :)

## Suggestions ##

I'd love some more suggestions so please let me know if there is a little script you'd like to see.

## Amazon ##

### amazon-s3-list.js ###

Lists the objects in a bucket.

    $ ./bin/amazon-s3-list.js --help
    $ ./bin/amazon-s3-list.js \
          --bucket BUCKET_NAME

### amazon-s3-upload.js ###

Just takes a file and uploads it. 

    $ ./bin/amazon-s3-upload.js --help
    $ ./bin/amazon-s3-upload.js \
          --bucket BUCKET_NAME \
          --filename FILENAME

### amazon-s3-download.js ###

Downloads an object from a bucket and saves it as a file. You must provide the bucket name, the object to download and
the filename to save it as.

Usage:

    $ ./bin/amazon-s3-download.js --help
    $ ./bin/amazon-s3-download.js \
          --bucket BUCKET_NAME \
          --object OBJECT \
          --filename FILENAME

### amazon-s3-sync-down.js && amazon-s3-sync-up.js ###

Both of these files takes a bucket name to sync to and tries to sync the current directory (and it's descendents) to
the bucket. The down script downloads any files not locally present. The up script uploads files not in the
bucket. Neither script tries to resolve conflicts in filesize or file contents and will instead just want you about
them.

    $ ./bin/amazon-s3-sync-down.js -b BUCKET_NAME
    $ ./bin/amazon-s3-sync-up.js -b BUCKET_NAME

# Author #

Written by [Andrew Chilton](http://chilts.org/) - [Blog](http://chilts.org/blog/) - [Twitter](https://twitter.com/andychilton).

# License #

The MIT License : http://opensource.org/licenses/MIT

Copyright (c) 2011-2012 AppsAttic Ltd. http://appsattic.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

(Ends)
