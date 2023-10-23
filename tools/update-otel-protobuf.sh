#!/bin/sh
set -e
# Shell script to update otlp protobuf sources in the source tree to a specific
# version

BASE_DIR="$( pwd )"/
DEPS_DIR="$BASE_DIR"deps/
PROTOBUF_VERSION=$1
OTEL_PROTO=$2

if [ "$#" -ne 2 ]; then
  echo "Error: please provide a protobuf and opentelemetry-proto versions"
  exit 1
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

git clone --depth=1 --branch="v$PROTOBUF_VERSION" git@github.com:protocolbuffers/protobuf.git
cd protobuf

echo "Building protobuf compiler"

sh autogen.sh
./configure
make -j12

cd ..

git clone --depth=1 --branch="v$OTEL_PROTO" git@github.com:open-telemetry/opentelemetry-proto.git
cd opentelemetry-proto

echo "Compiling Otel protofiles"

PROTO_FILES1=opentelemetry/proto/*/*/*.proto
PROTO_FILES2=opentelemetry/proto/*/*/*/*.proto
PROTO_GEN_CPP_DIR=gen/cpp

mkdir -p $PROTO_GEN_CPP_DIR

for f in ${PROTO_FILES1} ${PROTO_FILES2}
do
    ../protobuf/src/protoc --cpp_out=./$PROTO_GEN_CPP_DIR $f
done

echo "Removing old generated files"

cd "$DEPS_DIR"
rm -rf opentelemetry-cpp/third_party/opentelemetry-proto/gen

echo "Copying new generated files"

cp -r "$WORKSPACE"/opentelemetry-proto/gen opentelemetry-cpp/third_party/opentelemetry-proto/

echo ""
echo "All done!"
echo ""
echo "Please git add gen files, commit the new version, and whitespace-fix:"
echo ""
echo "$ git add -A deps/opentelemetry-cpp/third_party/opentelemetry-proto/gen"
echo "$ git commit -m \"deps: upgrade protobuf gen files to $OTEL_PROTO with $PROTOBUF_VERSION\""
echo "$ git rebase --whitespace=fix master"
echo ""
