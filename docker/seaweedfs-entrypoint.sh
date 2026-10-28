#!/bin/sh
# Writes the S3 identity file from environment variables, then starts SeaweedFS with the S3 gateway.
set -eu
mkdir -p /etc/seaweedfs
cat > /etc/seaweedfs/s3.json <<JSON
{"identities":[{"name":"amanta","credentials":[{"accessKey":"${S3_ACCESS_KEY_ID}","secretKey":"${S3_SECRET_ACCESS_KEY}"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON
exec weed server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json
