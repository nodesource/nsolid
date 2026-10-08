#!/bin/sh
set -ex
# Shell script to update protobuf in the source tree to specific version

BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
DEPS_DIR="$BASE_DIR/deps"

[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')
cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}
trap cleanup INT TERM EXIT

# Regenerate proto files after updating protobuf
echo "Regenerating OpenTelemetry proto files"
regenerate_proto_otel "$WORKSPACE" "$DEPS_DIR" "$BASE_DIR"

echo "Regenerating proto files for agents"
regenerate_proto_agents "$BASE_DIR" "$DEPS_DIR"
