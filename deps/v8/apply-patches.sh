#!/bin/bash
set -Eeuo pipefail

PATCHES_DIR="$(dirname "$0")/patches"

shopt -s nullglob
for patch in "$PATCHES_DIR"/*.patch; do
  [ -f "$patch" ] || continue
  name="$(basename "$patch")"
  echo "Processing ${name}..."
  # If the reverse applies cleanly, the patch is already applied.
  if git apply --reverse --check "$patch" >/dev/null 2>&1; then
    echo "  ${name}: already applied, skipping."
    continue
  fi
  # Otherwise, apply if it would apply cleanly.
  if git apply --check "$patch" >/dev/null 2>&1; then
    echo "  ${name}: applying..."
    git apply --index --3way "$patch"
    echo "  ${name}: applied."
  else
    echo "  ${name}: ERROR: patch does not apply cleanly:"
    # Show why it fails, then exit non-zero to stop the build.
    git apply --check "$patch" || true
    exit 1
  fi
done
