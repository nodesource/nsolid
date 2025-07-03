#!/bin/sh
set -e
# Shell script to update libbpf in the source tree to a specific version

BASE_DIR=$(cd "$(dirname "$0")/../../" && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

# Get the current version from the CHECKPOINT file
CURRENT_VERSION=$(cat "$DEPS_DIR/libbpf/CHECKPOINT" || echo "none")

# If a specific version is provided as an argument, use that instead of fetching the latest
if [ "$#" -ge 1 ]; then
  NEW_VERSION="$1"
else
  # Use GitHub API to get the latest tag
  NEW_VERSION="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/libbpf/libbpf/tags',
  process.env.GITHUB_TOKEN && {
    headers: {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    },
  });
if (!res.ok) throw new Error(`FetchError: ${res.status} ${res.statusText}`, { cause: res });
const tags = await res.json();
if (tags.length === 0) throw new Error('No tags found');
// Sort tags by creation date (newer first)
const latestTag = tags[0].name;
console.log(latestTag);
EOF
)"
fi

# Exit with 0 if new version and current version are the same
if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "Skipped because libbpf is already using version $CURRENT_VERSION."
  exit 0
fi

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

cd "$WORKSPACE"

LIBBPF_TARBALL="libbpf-${NEW_VERSION}.tar.gz"

echo "Fetching libbpf source archive for version ${NEW_VERSION}"
curl -sL -o "$LIBBPF_TARBALL" "https://github.com/libbpf/libbpf/archive/refs/tags/${NEW_VERSION}.tar.gz"
gzip -dc "$LIBBPF_TARBALL" | tar xf -
rm "$LIBBPF_TARBALL"
# The extracted directory will have the version name without the 'v' prefix if it exists
EXTRACTED_DIR="libbpf-$(echo "$NEW_VERSION" | sed 's/^v//')"
mv "$EXTRACTED_DIR" "libbpf"

# Preserve the gyp file if it exists
if [ -f "$DEPS_DIR/libbpf/libbpf.gyp" ]; then
  echo "Copying existing gyp file"
  cp "$DEPS_DIR/libbpf/libbpf.gyp" "$WORKSPACE/libbpf/"
fi

# Preserve the BPF-CHECKPOINT file if it exists
if [ -f "$DEPS_DIR/libbpf/BPF-CHECKPOINT" ]; then
  echo "Copying existing BPF-CHECKPOINT file"
  cp "$DEPS_DIR/libbpf/BPF-CHECKPOINT" "$WORKSPACE/libbpf/"
fi

# Update CHECKPOINT file with the new version
echo "$NEW_VERSION" > "$WORKSPACE/libbpf/CHECKPOINT"

# Delete the existing directory and replace it with the new one
echo "Replacing existing libbpf directory"
rm -rf "$DEPS_DIR/libbpf"
cp -R "$WORKSPACE/libbpf" "$DEPS_DIR/"

echo "libbpf updated to version $NEW_VERSION"

# Print the new version as the last line of the script
# as we need to add it to $GITHUB_ENV variable in GitHub Actions
echo "NEW_VERSION=$NEW_VERSION"
