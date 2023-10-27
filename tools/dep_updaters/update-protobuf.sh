#!/bin/sh
set -e
# Shell script to update protobuf in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

NEW_VERSION=$1

if [ "$#" -le 0 ]; then
  echo "Error: please provide a protobuf version to update to"
  exit 1
fi

CURRENT_VERSION=$(grep "PACKAGE_VERSION=" ./deps/protobuf/configure | awk -F"'" '{print $2}')

# This function exit with 0 if new version and current version are the same
compare_dependency_version "protobuf" "$NEW_VERSION" "$CURRENT_VERSION"

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

PROTOBUF_REF="v${NEW_VERSION#3.}"
PROTOBUF_TARBALL="protobuf-cpp-$NEW_VERSION.tar.gz"

cd "$WORKSPACE"

echo "Fetching protobuf source archive"
curl -sL -o "$PROTOBUF_TARBALL" "https://github.com/protocolbuffers/protobuf/releases/download/$PROTOBUF_REF/$PROTOBUF_TARBALL"

log_and_verify_sha256sum "protobuf" "$PROTOBUF_TARBALL"

gzip -dc "$PROTOBUF_TARBALL" | tar xf -
rm "$PROTOBUF_TARBALL"
mv "protobuf-$NEW_VERSION" protobuf

cd protobuf

echo "Removing everything, except src/ and LICENSE"
for dir in *; do
  if [ "$dir" = "src" ] || [ "$dir" = "configure" ] || [ "$dir" = "LICENSE" ]; then
    continue
  fi
  rm -rf "$dir"
done
rm -rf src/solaris src/google/protobuf/*test*

echo "Copying existing gyp files"
cp "$DEPS_DIR/protobuf/protobuf.gyp" "$WORKSPACE/protobuf"

echo "Replacing existing protobuf"
rm -rf "$DEPS_DIR/protobuf"
mv "$WORKSPACE/protobuf" "$DEPS_DIR/"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "protobuf" "$NEW_VERSION"
