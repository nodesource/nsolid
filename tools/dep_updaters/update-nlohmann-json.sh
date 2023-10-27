#!/bin/sh
set -e
# Shell script to update nlohmann::json in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

NEW_VERSION="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/nlohmann/json/releases/latest',
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

VERSION_MAJOR=$(grep "#define NLOHMANN_JSON_VERSION_MAJOR" ./deps/json/single_include/nlohmann/json.hpp | awk  '{print $NF}')
VERSION_MINOR=$(grep "#define NLOHMANN_JSON_VERSION_MINOR" ./deps/json/single_include/nlohmann/json.hpp | awk  '{print $NF}')
VERSION_PATCH=$(grep "#define NLOHMANN_JSON_VERSION_PATCH" ./deps/json/single_include/nlohmann/json.hpp | awk  '{print $NF}')
CURRENT_VERSION=$VERSION_MAJOR.$VERSION_MINOR.$VERSION_PATCH

# This function exit with 0 if new version and current version are the same
compare_dependency_version "nghttp2" "$NEW_VERSION" "$CURRENT_VERSION"

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

JSON_REF="v$NEW_VERSION"
JSON_INCLUDE_ZIP="include.zip"

cd "$WORKSPACE"

echo "Fetching json source archive"
curl -sL -o "$JSON_INCLUDE_ZIP" "https://github.com/nlohmann/json/releases/download/$JSON_REF/$JSON_INCLUDE_ZIP"

log_and_verify_sha256sum "json" "$JSON_INCLUDE_ZIP"

unzip -d json "$JSON_INCLUDE_ZIP"
rm "$JSON_INCLUDE_ZIP"

echo "Removing everything, except lib/ and COPYING"
cd json
for dir in *; do
  if [ "$dir" = "single_include" ] || [ "$dir" = "LICENSE.MIT" ]; then
    continue
  fi
  rm -rf "$dir"
done

echo "Replacing existing json"
rm -rf "$DEPS_DIR/json"
mv "$WORKSPACE/json" "$DEPS_DIR/"

# # Update the version number on maintaining-dependencies.md
# # and print the new version as the last line of the script as we need
# # to add it to $GITHUB_ENV variable
finalize_version_update "json" "$NEW_VERSION"
