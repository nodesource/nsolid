#!/bin/sh

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export ROOT

# This function compare new version with current version of a dependency and
# exit the script if the versions are the same
#
# $1 is the package name e.g. 'acorn', 'ada', 'base64' etc. See the file
# https://github.com/nodejs/node/blob/main/doc/contributing/maintaining/maintaining-dependencies.md
# for a complete list of package name
# $2 is the new version.
compare_dependency_version() {
  package_name="$1"
  new_version="$2"
  current_version="$3"
  echo "Comparing $new_version with $current_version"
  if [ "$new_version" = "$current_version" ]; then
    echo "Skipped because $package_name is on the latest version."
    exit 0
  fi
}

# This function inform to commit the new version of a maintained dependency
# and print the last line of the script "NEW_VERSION=$NEW_VERSION" as we need
# to add it to $GITHUB_ENV variable.
#
# $1 is the package name e.g. 'acorn', 'ada', 'base64' etc. See the file
# https://github.com/nodejs/node/blob/main/doc/contributing/maintaining/maintaining-dependencies.md
# for a complete list of package name
# $2 is the new version.
# $3 (optional) other files to be git added apart from the deps/package_name
finalize_version_update() {
  package_name="$1"
  new_version="$2"
  extra_files="$3"

  echo "All done!"
  echo ""
  echo "Please git add $package_name and commit the new version:"
  echo ""
  echo "$ git add -A deps/$package_name $extra_files"
  echo "$ git commit -m \"deps: update $package_name to $new_version\""
  echo ""

  # The last line of the script should always print the new version,
  # as we need to add it to $GITHUB_ENV variable.
  echo "NEW_VERSION=$new_version"
}

# This function logs the archive checksum and, if provided, compares it with
# the deposited checksum
#
# $1 is the package name e.g. 'acorn', 'ada', 'base64' etc. See the file
# https://github.com/nodejs/node/blob/main/doc/contributing/maintaining/maintaining-dependencies.md
# for a complete list of package name
# $2 is the downloaded archive
# $3 (optional) is the deposited sha256 checksum. When provided, it is checked
# against the checksum generated from the archive
log_and_verify_sha256sum() {
  package_name="$1"
  archive="$2"
  checksum="$3"
  bsd_formatted_checksum=$(shasum -a 256 --tag "$archive")
  if [ -z "$3" ]; then
    echo "$bsd_formatted_checksum"
  else
    archive_checksum=$(shasum -a 256 "$archive")
    if [ "$checksum" = "$archive_checksum" ]; then
      echo "Valid $package_name checksum"
      echo "$bsd_formatted_checksum"
    else
      echo "ERROR - Invalid $package_name checksum:"
      echo "deposited: $checksum"
      echo "generated: $archive_checksum"
      exit 1
    fi
  fi
}

# This function replaces the directory of a dependency with the new one.
replace_dir() {
  old_dir="$1"
  new_dir="$2"
  rm -rf "$old_dir"
  mv "$new_dir" "$old_dir"
}

# Helper function to set up protoc environment
setup_protoc_environment() {
  # Use _variable naming convention instead of 'local'
  _base_dir="$1"
  
  echo "Setting up protoc environment"
  cd "$_base_dir" || exit 1
  # Generate grpc_cpp_plugin
  echo "Generating protoc and grpc_cpp_plugin"
  ./configure && make -j12 -C out protoc protoc-gen-cpp grpc_cpp_plugin
}

regenerate_proto_otel() {
  # Use _variable naming convention instead of 'local'
  _workspace="$1"
  _deps_dir="$2"
  _base_dir="$3"

  # Set up protoc environment
  setup_protoc_environment "$_base_dir" > /dev/null
  _protoc_path="$_base_dir/out/Release/protoc"
  _protoc_gen_cpp_path="$_base_dir/out/Release/protoc-gen-cpp"
  _grpc_cpp_plugin_path="$_base_dir/out/Release/grpc_cpp_plugin"

  echo "Getting opentelemetry-proto files"
  cd "$_workspace" || exit 1
  OTEL_PROTO_VERSION=$(grep "opentelemetry-proto" "$_deps_dir/opentelemetry-cpp/MODULE.bazel" | sed -n 's/.*version = "\([^"]*\)".*/\1/p')
  OTEL_PROTO_TARBALL=v$OTEL_PROTO_VERSION.tar.gz

  curl -sL -o "$OTEL_PROTO_TARBALL" "https://github.com/open-telemetry/opentelemetry-proto/archive/refs/tags/$OTEL_PROTO_TARBALL"

  log_and_verify_sha256sum "opentelemetry-proto" "$OTEL_PROTO_TARBALL"

  gzip -dc "$OTEL_PROTO_TARBALL" | tar xf -
  rm "$OTEL_PROTO_TARBALL"

  echo "Building protobuf files"
  cd "opentelemetry-proto-$OTEL_PROTO_VERSION" || exit 1
  mkdir -p "$_deps_dir/opentelemetry-cpp/third_party/opentelemetry-proto/gen/cpp"
  "$_protoc_path" \
      --cpp_out="$_deps_dir/opentelemetry-cpp/third_party/opentelemetry-proto/gen/cpp" \
      --grpc-cpp_out="$_deps_dir/opentelemetry-cpp/third_party/opentelemetry-proto/gen/cpp" \
      --plugin="protoc-gen-cpp=$_protoc_gen_cpp_path" \
      --plugin="protoc-gen-grpc-cpp=$_grpc_cpp_plugin_path" \
      opentelemetry/proto/common/v1/common.proto \
      opentelemetry/proto/logs/v1/logs.proto \
      opentelemetry/proto/metrics/v1/metrics.proto \
      opentelemetry/proto/resource/v1/resource.proto \
      opentelemetry/proto/trace/v1/trace.proto \
      opentelemetry/proto/collector/logs/v1/logs_service.proto \
      opentelemetry/proto/collector/metrics/v1/metrics_service.proto \
      opentelemetry/proto/collector/trace/v1/trace_service.proto

  echo "Copying protobuf files to opentelemetry-cpp for testing purposes"
  cp -r opentelemetry "$_deps_dir/opentelemetry-cpp/third_party/opentelemetry-proto/."
}

regenerate_proto_agents() {
  # Use _variable naming convention instead of 'local'
  _base_dir="$1"
  _deps_dir="$2"
  _workspace="${3:-$_base_dir}"
  
  # Set up protoc environment
  setup_protoc_environment "$_base_dir" > /dev/null
  _protoc_path="$_base_dir/out/Release/protoc"
  _protoc_gen_cpp_path="$_base_dir/out/Release/protoc-gen-cpp"
  _grpc_cpp_plugin_path="$_base_dir/out/Release/grpc_cpp_plugin"

  echo "Regenerating proto files in agents/grpc/proto"
  
  # Create output directory if it doesn't exist
  mkdir -p "$_base_dir/agents/grpc/src/proto/"
  
  # Run protoc to generate the C++ files
  "$_protoc_path" \
    --cpp_out="$_base_dir/agents/grpc/src/proto/" \
    --grpc-cpp_out="$_base_dir/agents/grpc/src/proto/" \
    --plugin="protoc-gen-cpp=$_protoc_gen_cpp_path" \
    --plugin="protoc-gen-grpc-cpp=$_grpc_cpp_plugin_path" \
    --proto_path="$_base_dir/agents/grpc/proto/" \
    --proto_path="$_base_dir/deps/protobuf/src/" \
    --proto_path="$_base_dir/deps/opentelemetry-cpp/third_party/opentelemetry-proto/" \
    "$_base_dir/agents/grpc/proto/"*.proto
    
  echo "Proto files regenerated successfully in agents/grpc/src/proto/"
}
