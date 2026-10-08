#!/bin/sh
set -e
# Shell script to update libzmq in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

NEW_VERSION="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/zeromq/libzmq/releases/latest',
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

cd ./deps/zmq
CURRENT_VERSION=$(./version.sh)
cd -

# This function exit with 0 if new version and current version are the same
compare_dependency_version "libzmq" "$NEW_VERSION" "$CURRENT_VERSION"

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

LIBZMQ_REF="v$NEW_VERSION"
LIBZMQ_TARBALL="zeromq-$NEW_VERSION.tar.gz"

cd "$WORKSPACE"

echo "Fetching libzmq source archive"
curl -sL -o "$LIBZMQ_TARBALL" "https://github.com/zeromq/libzmq/releases/download/$LIBZMQ_REF/$LIBZMQ_TARBALL"

log_and_verify_sha256sum "libzmq" "$LIBZMQ_TARBALL"

gzip -dc "$LIBZMQ_TARBALL" | tar xf -
rm "$LIBZMQ_TARBALL"
mv "zeromq-$NEW_VERSION" zmq

cd zmq

echo "Removing everything, except src/ include/ external/wepoll COPYING and version.sh"
for dir in *; do
  if [ "$dir" = "src" ] || \
     [ "$dir" = "include" ] || \
     [ "$dir" = "external" ] || \
     [ "$dir" = "LICENSE" ] || \
     [ "$dir" = "version.sh" ]; then
    continue
  fi
  rm -rf "$dir"
done
find external -type d ! -name "external" ! -name "wepoll" -print0 | xargs -0 rm -r

echo "Copying existing gyp files"
cp "$DEPS_DIR"/zmq/zmq.gyp* "$WORKSPACE/zmq"

echo "Copying existing platform.hpp file"
cp "$DEPS_DIR/zmq/src/platform.hpp" "$WORKSPACE/zmq/src"

echo "Replacing existing libzmq"
rm -rf "$DEPS_DIR/zmq"
mv "$WORKSPACE/zmq" "$DEPS_DIR/"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "libzmq" "$NEW_VERSION"
