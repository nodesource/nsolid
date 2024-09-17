#!/bin/sh

# It generates the N|Solid JS API:
#  nsolid-docs.sh

# Depends on node and npm being in $PATH.

# This script must be in the tools directory when it runs because it uses
# $0 to determine directories to work in.

set -e
set -x

cd "$(dirname "$0")"
OUT_DIR=../out/doc/nsolid
VERSION=6.0.1

# install jsdoc-to-markdown
rm -rf node_modules/jsdoc-to-markdown
mkdir jsdoc-to-markdown-tmp
cd jsdoc-to-markdown-tmp
npm init --yes

npm install --global-style --no-bin-links --production --no-package-lock jsdoc-to-markdown@${VERSION}

cd ..
mv jsdoc-to-markdown-tmp/node_modules/jsdoc-to-markdown node_modules/jsdoc-to-markdown
rm -rf jsdoc-to-markdown-tmp/

# Generate the documentation
mkdir -p ${OUT_DIR}
node ./nsolid-docs.js > ${OUT_DIR}/API.md

# remove jsdoc-to-markdown
rm -rf node_modules/jsdoc-to-markdown
