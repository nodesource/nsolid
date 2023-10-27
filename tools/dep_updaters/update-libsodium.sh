#!/bin/sh
set -e
# Shell script to update libsodium in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

NEW_VERSION="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/jedisct1/libsodium/releases/latest',
  process.env.GITHUB_TOKEN && {
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    },
  });
if (!res.ok) throw new Error(`FetchError: ${res.status} ${res.statusText}`, { cause: res });
const { tag_name } = await res.json();
console.log(tag_name.replace('-RELEASE', ''));
EOF
)"

CURRENT_VERSION=$(grep "#define SODIUM_VERSION_STRING" ./deps/sodium/src/libsodium/include/sodium/version.h | awk -F'"' '{print $2}')

# This function exit with 0 if new version and current version are the same
compare_dependency_version "libsodium" "$NEW_VERSION" "$CURRENT_VERSION"

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

LIBSODIUM_REF="$NEW_VERSION-RELEASE"
LIBSODIUM_TARBALL="libsodium-$NEW_VERSION.tar.gz"

cd "$WORKSPACE"

echo "Fetching libsodium source archive"
curl -sL -o "$LIBSODIUM_TARBALL" "https://github.com/jedisct1/libsodium/releases/download/$LIBSODIUM_REF/$LIBSODIUM_TARBALL"

log_and_verify_sha256sum "libsodium" "$LIBSODIUM_TARBALL"

gzip -dc "$LIBSODIUM_TARBALL" | tar xf -
rm "$LIBSODIUM_TARBALL"
mv libsodium-stable sodium

cd sodium

autoreconf -i

./configure

echo "Removing everything, except src/, LICENSE, .github and .gitignore"
for dir in *; do
  if [ "$dir" = "src" ] || [ "$dir" = "LICENSE" ]; then
    continue
  fi
  rm -rf "$dir"
done
rm -r .git*
# Find and delete ".deps" directories
find ./ -type d -name ".deps" | while read -r dir; do
    rm -r "$dir"
done

# Find and delete "Makefile" and "Makefile.in" files
find ./ -type f \( -name "Makefile" -o -name "Makefile.in" \) | while read -r file; do
    rm "$file"
done

echo "Copying existing gyp files"
cp "$DEPS_DIR/sodium/sodium.gyp" "$WORKSPACE/sodium"

echo "Replacing existing libsodium"
rm -rf "$DEPS_DIR/sodium"
mv "$WORKSPACE/sodium" "$DEPS_DIR/"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "libsodium" "$NEW_VERSION"
