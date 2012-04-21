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

(Ends)
