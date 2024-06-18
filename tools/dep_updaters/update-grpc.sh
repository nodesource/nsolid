#!/bin/sh
set -ex
# Shell script to update protobuf in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

# NEW_VERSION=$1

# if [ "$#" -le 0 ]; then
#   echo "Error: please provide a protobuf version to update to"
#   exit 1
# fi

NEW_VERSION="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/grpc/grpc/releases/latest',
  process.env.GITHUB_TOKEN && {
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    },
  });
if (!res.ok) throw new Error(`FetchError: ${res.status} ${res.statusText}`, { cause: res });
const { tag_name } = await res.json();
console.log(tag_name.replace('v', ''));
EOF
)"

CURRENT_VERSION=$(grep GRPC_CPP_VERSION_STRING ./deps/grpc/include/grpcpp/version_info.h | awk -F" " '{print $3}' | tr -d '"')

# This function exit with 0 if new version and current version are the same
compare_dependency_version "grpc" "$NEW_VERSION" "$CURRENT_VERSION"

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

GRPC_TARBALL="v$NEW_VERSION.tar.gz"

cd "$WORKSPACE"

echo "Cloning grpc repository"
git clone -b "v$NEW_VERSION" --depth=1 --no-recurse-submodules https://github.com/grpc/grpc

cd grpc

git submodule init third_party/abseil-cpp third_party/address_sorting third_party/re2 third_party/upb third_party/xxhash
git submodule update --depth 1 third_party/abseil-cpp third_party/address_sorting third_party/re2 third_party/upb third_party/xxhash

echo "Removing everything, except source files and LICENSE"
for dir in *; do
  if [ "$dir" = "include" ] || [ "$dir" = "src" ] || [ "$dir" = "spm-cpp-include" ] || [ "$dir" = "spm-core-include" ] || [ "$dir" = "third_party" ] || [ "$dir" = "Makefile" ] || [ "$dir" = "LICENSE" ]; then
    continue
  fi
  rm -rf "$dir"
done

echo "Copying existing gyp files"
cp "$DEPS_DIR/grpc/grpc.gyp" "$WORKSPACE/grpc"

echo "Replacing existing grpc"
rm -rf "$DEPS_DIR/grpc"
mv "$WORKSPACE/grpc" "$DEPS_DIR/"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "grpc" "$NEW_VERSION"
