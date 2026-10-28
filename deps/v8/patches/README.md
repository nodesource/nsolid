# V8 Patches for N|Solid

This directory contains individual patches applied to the V8 dependency for N|Solid-specific features and fixes.

## Patches

- **001-clang-macros-fix.patch**: Fixes is_trivially_copyable for Clang versions <= 17 in base/macros.h
- **002-cpu-profiler-sigprof-fix.patch**: Prevents crash when handling SIGPROF signal during profiler shutdown in cpu-profiler.cc
- **003-heap-snapshot-generator-header.patch**: Updates header for redaction support in heap-snapshot-generator.h
- **004-heap-snapshot-generator-redact.patch**: Adds redaction support to heap snapshot serialization in heap-snapshot-generator.cc
- **005-output-stream-escape.patch**: Adds string escaping functions to output-stream-writer.h
- **006-profile-generator-json-fix.patch**: Improves JSON serialization in profile-generator.cc
- **007-redacted-heap-snapshot-api.patch**: Implements RedactedHeapSnapshot in api.cc
- **008-redacted-heap-snapshot-header.patch**: Adds RedactedHeapSnapshot class to v8-profiler.h

## Usage

The V8 patches are applied using the `apply-patches.sh` script as a developer tool. This script should be run after checking out the repository or when V8 patches need to be updated.
The script can be executed from either location:

- From the deps/v8 directory: `cd deps/v8 && ./apply-patches.sh`
- From the repository root: `deps/v8/apply-patches.sh`

The script is idempotent - it can be run multiple times safely, as it will skip patches that are already applied and only apply those that aren't.

The former `009-int64-lowering-tuple-fix.patch` is obsolete: V8 now uses
`MakeTuple`; restoring the old `Tuple` API breaks 32-bit builds.

## Updating the Node.js base

1. Save the current branch in a backup before starting from the new tag.
2. Port the N|Solid source changes and run `deps/v8/apply-patches.sh`.
3. Refresh stale patches while preserving the new upstream V8 APIs.
4. Apply the patches in order to pristine V8 in a temporary index and
   compare the result with the patched sources.
5. Run the application script again to check idempotence, then build and
   run the profiler and heap-snapshot tests.
