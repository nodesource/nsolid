#!/usr/bin/env bash

# create new self-signed credentials for running under HTTPS

echo "creating new files:"
echo "* nsolid-self-signed.key"
echo "* nsolid-self-signed.crt"
echo ""

openssl genrsa -des3 -passout pass:foobar -out server.pass.key 2048

openssl rsa -passin pass:foobar -in server.pass.key -out nsolid-self-signed.key

rm server.pass.key

openssl req \
  -new \
  -key nsolid-self-signed.key \
  -out server.csr \
  -subj "/CN=NodeSource N|Solid self-signed certificate"

openssl x509 \
  -req -sha256 \
  -days 3650 \
  -in server.csr \
  -signkey nsolid-self-signed.key \
  -out nsolid-self-signed.crt

rm server.csr
