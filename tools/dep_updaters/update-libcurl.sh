#!/bin/sh
set -e
# Shell script to update libcurl in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

LIBCURL_REF="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/curl/curl/releases/latest',
  process.env.GITHUB_TOKEN && {
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    },
  });
if (!res.ok) throw new Error(`FetchError: ${res.status} ${res.statusText}`, { cause: res });
const { tag_name } = await res.json();
console.log(tag_name);
EOF
)"

NEW_VERSION=$(echo "$LIBCURL_REF" | sed 's/_/./g' | sed 's/curl-//g')

CURRENT_VERSION=$(grep "#define LIBCURL_VERSION" ./deps/curl/include/curl/curlver.h | awk -F'"' '{print $2}')

# This function exit with 0 if new version and current version are the same
compare_dependency_version "libcurl" "$NEW_VERSION" "$CURRENT_VERSION"

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

LIBCURL_TARBALL="curl-$NEW_VERSION.tar.gz"

cd "$WORKSPACE"

echo "Fetching libcurl source archive"
curl -sL -o "$LIBCURL_TARBALL" "https://github.com/curl/curl/releases/download/$LIBCURL_REF/$LIBCURL_TARBALL"

log_and_verify_sha256sum "libcurl" "$LIBCURL_TARBALL"

gzip -dc "$LIBCURL_TARBALL" | tar xf -
rm "$LIBCURL_TARBALL"
mv "curl-$NEW_VERSION" curl

cd curl

echo "Removing everything, except lib/ include/ and COPYING"
for dir in *; do
  if [ "$dir" = "lib" ] || [ "$dir" = "include" ] || [ "$dir" = "COPYING" ]; then
    continue
  fi
  rm -rf "$dir"
done

echo "Copying existing gyp files"
cp "$DEPS_DIR/curl/curl.gyp" "$WORKSPACE/curl"

echo "Replacing existing libcurl"
rm -rf "$DEPS_DIR/curl"
mv "$WORKSPACE/curl" "$DEPS_DIR/"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "libcurl" "$NEW_VERSION"
