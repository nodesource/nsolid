#!/bin/sh
set -ex
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

CURRENT_VERSION=$(jq -r 'to_entries[] | .value.protoc_version' deps/protobuf/version.json)

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

PROTOBUF_REF="v${NEW_VERSION#5.}"

cd "$WORKSPACE"
echo "Cloning protobuf repository"
# We can either use git clone with PROTOBUF_REF
git clone -b "$PROTOBUF_REF" --depth=1 --no-recurse-submodules https://github.com/protocolbuffers/protobuf

# Or download the tarball using PROTOBUF_TARBALL (uncomment to use this method)
# PROTOBUF_TARBALL="protobuf-$NEW_VERSION.tar.gz"
# curl -sL -o "$PROTOBUF_TARBALL" "https://github.com/protocolbuffers/protobuf/archive/refs/tags/$PROTOBUF_REF.tar.gz"
# gzip -dc "$PROTOBUF_TARBALL" | tar xf -
# rm "$PROTOBUF_TARBALL"
# mv "protobuf-$NEW_VERSION" protobuf

cd protobuf

git submodule init third_party/utf8_range
git submodule update --depth 1 third_party/utf8_range

# Get abseil-cpp version from cmake/dependencies.cmake
ABSEIL_VERSION=$(grep 'set(abseil-cpp-version' "$WORKSPACE/protobuf/cmake/dependencies.cmake" | sed -E 's/.*"([^"]+)".*/\1/')
echo "Detected abseil-cpp version: $ABSEIL_VERSION"
cd third_party

# Get abseil-cpp repository
ABSEIL_TARBALL="$ABSEIL_VERSION.tar.gz"

echo "Fetching abseil-cpp source archive"
curl -sL -o "$ABSEIL_TARBALL" "https://github.com/abseil/abseil-cpp/archive/refs/tags/$ABSEIL_TARBALL"
log_and_verify_sha256sum "abseil-cpp" "$ABSEIL_TARBALL"
gzip -dc "$ABSEIL_TARBALL" | tar xf -
rm -- "$ABSEIL_TARBALL"

FOLDER="abseil-cpp-$ABSEIL_VERSION"

mv -- "$FOLDER" abseil-cpp

echo "Removing tests"
rm -r "./abseil-cpp/ci" "./abseil-cpp/CMake" "./abseil-cpp/.github"

cd "$WORKSPACE/protobuf"

echo "Removing everything, except src/ and LICENSE"
for dir in *; do
  if [ "$dir" = "src" ] || \
     [ "$dir" = "third_party" ] || \
     [ "$dir" = "version.json" ] || \
     [ "$dir" = "LICENSE" ]; then
    continue
  fi
  rm -rf "$dir"
done
rm -rf src/solaris src/google/protobuf/*test*

find . -name ".git" -type d -exec rm -rf {} +
find . -name ".git" -type f -exec rm -rf {} +
rm .gitmodules .bazeliskrc

echo "Copying existing gyp files"
cp "$DEPS_DIR/protobuf/abseil.gyp" "$DEPS_DIR/protobuf/protobuf.gyp" "$DEPS_DIR/protobuf/utf8_range.gyp" "$WORKSPACE/protobuf"

echo "Replacing existing protobuf"
rm -rf "$DEPS_DIR/protobuf"
mv "$WORKSPACE/protobuf" "$DEPS_DIR/"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "protobuf" "$NEW_VERSION"

# Regenerate proto files after updating protobuf
echo "Regenerating OpenTelemetry proto files"
regenerate_proto_otel "$WORKSPACE" "$DEPS_DIR" "$BASE_DIR"

echo "Regenerating proto files for agents"
regenerate_proto_agents "$BASE_DIR" "$DEPS_DIR"
