#!/bin/sh
set -e
# Shell script to update opentelemetry-cpp in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

NEW_VERSION="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/open-telemetry/opentelemetry-cpp/releases/latest',
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

CURRENT_VERSION=$(grep "#define OPENTELEMETRY_VERSION" ./deps/opentelemetry-cpp/api/include/version.h | awk -F'"' '{print $2}')

# This function exit with 0 if new version and current version are the same
compare_dependency_version "opentelemetry-cpp" "$NEW_VERSION" "$CURRENT_VERSION"

echo "Making temporary workspace"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

OPENTELEMETRY_CPP_TARBALL="v$NEW_VERSION.tar.gz"

cd "$WORKSPACE"

echo "Fetching opentelemetry-cpp source archive"
curl -sL -o "$OPENTELEMETRY_CPP_TARBALL" "https://github.com/open-telemetry/opentelemetry-cpp/archive/refs/tags/$OPENTELEMETRY_CPP_TARBALL"

log_and_verify_sha256sum "opentelemetry-cpp" "$OPENTELEMETRY_CPP_TARBALL"

gzip -dc "$OPENTELEMETRY_CPP_TARBALL" | tar xf -
rm "$OPENTELEMETRY_CPP_TARBALL"
mv "opentelemetry-cpp-$NEW_VERSION" opentelemetry-cpp

cd opentelemetry-cpp

echo "Removing everything, except src/ and LICENSE"
for dir in *; do
  if [ "$dir" = "api" ] || [ "$dir" = "exporters" ] || [ "$dir" = "ext" ] || [ "$dir" = "sdk" ] || [ "$dir" = "third_party" ] || [ "$dir" = "LICENSE" ]; then
    continue
  fi
  rm -rf "$dir"
done

echo "Copying existing gyp files"
cp "$DEPS_DIR/opentelemetry-cpp/otlp-http-exporter.gyp" "$WORKSPACE/opentelemetry-cpp"

# Build opentelemetry-proto files
echo "Getting protoc executable"

cd "$WORKSPACE"
PROTOBUF_VERSION_3=$(grep "PACKAGE_VERSION=" "$DEPS_DIR/protobuf/configure" | awk -F"'" '{print $2}')
PROTOBUF_VERSION="${PROTOBUF_VERSION_3#3.}"
PROTOC_ZIP="protoc-$PROTOBUF_VERSION-linux-x86_64.zip"

curl -sL -o "$PROTOC_ZIP" "https://github.com/protocolbuffers/protobuf/releases/download/v$PROTOBUF_VERSION/$PROTOC_ZIP"
unzip -o "$PROTOC_ZIP" -d ./protoc/

echo "Getting opentelemetry-proto files"
OTEL_PROTO_VERSION="1.3.0"
OTEL_PROTO_TARBALL=v$OTEL_PROTO_VERSION.tar.gz

curl -sL -o "$OTEL_PROTO_TARBALL" "https://github.com/open-telemetry/opentelemetry-proto/archive/refs/tags/$OTEL_PROTO_TARBALL"

log_and_verify_sha256sum "opentelemetry-proto" "$OTEL_PROTO_TARBALL"

gzip -dc "$OTEL_PROTO_TARBALL" | tar xf -
rm "$OTEL_PROTO_TARBALL"
cd opentelemetry-proto-$OTEL_PROTO_VERSION
mkdir -p "$WORKSPACE/opentelemetry-cpp/third_party/opentelemetry-proto/gen/cpp"
"$WORKSPACE/protoc/bin/protoc" --cpp_out="$WORKSPACE/opentelemetry-cpp/third_party/opentelemetry-proto/gen/cpp" \
    opentelemetry/proto/common/v1/common.proto \
    opentelemetry/proto/logs/v1/logs.proto \
    opentelemetry/proto/metrics/v1/metrics.proto \
    opentelemetry/proto/resource/v1/resource.proto \
    opentelemetry/proto/trace/v1/trace.proto \
    opentelemetry/proto/collector/logs/v1/logs_service.proto \
    opentelemetry/proto/collector/metrics/v1/metrics_service.proto \
    opentelemetry/proto/collector/trace/v1/trace_service.proto



echo "Replacing existing opentelemetry-cpp"
rm -rf "$DEPS_DIR/opentelemetry-cpp"
mv "$WORKSPACE/opentelemetry-cpp" "$DEPS_DIR/"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "opentelemetry-cpp" "$NEW_VERSION"
