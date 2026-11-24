# Node.js Core Benchmarks

This folder contains code and data used to measure performance
of different Node.js implementations and different ways of
writing JavaScript run by the built-in JavaScript engine.

For a detailed guide on how to write and run benchmarks in this
directory, see [the guide on benchmarks](../doc/contributing/writing-and-running-benchmarks.md).

## Table of Contents

* [File tree structure](#file-tree-structure)
* [N|Solid tracing benchmarks](#nsolid-tracing-benchmarks)
* [Common API](#common-api)

## File tree structure

### Directories

Benchmarks testing the performance of a single node submodule are placed into a
directory with the corresponding name, so that they can be executed by submodule
or individually.
Benchmarks that span multiple submodules may either be placed into the `misc`
directory or into a directory named after the feature they benchmark.
E.g. benchmarks for various new ECMAScript features and their pre-ES2015
counterparts are placed in a directory named `es`.
Fixtures that are not specific to a certain benchmark but can be reused
throughout the benchmark suite should be placed in the `fixtures` directory.

### Other Top-level files

The top-level files include common dependencies of the benchmarks
and the tools for launching benchmarks and visualizing their output.
The actual benchmark scripts should be placed in their corresponding
directories.

* `_benchmark_progress.js`: implements the progress bar displayed
  when running `compare.js` and `scatter.js`
* `_cli.js`: parses the command line arguments passed to `compare.js`,
  `run.js` and `scatter.js`
* `_cli.R`: parses the command line arguments passed to `compare.R`
* `_http-benchmarkers.js`: selects and runs external tools for benchmarking
  the `http` subsystem.
* `bar.R`: R script for visualizing the output of benchmarks with bar plots.
* `common.js`: see [Common API](#common-api).
* `compare.js`: command line tool for comparing performance between different
  Node.js binaries.
* `compare.R`: R script for statistically analyzing the output of
  `compare.js`
* `run.js`: command line tool for running individual benchmark suite(s).
* `scatter.js`: command line tool for comparing the performance
  between different parameters in benchmark configurations,
  for example to analyze the time complexity. Pass `--analyze` to
  summarize the results without R.
* `scatter.R`: R script for visualizing the output of `scatter.js` with
  scatter plots.

## N|Solid tracing benchmarks

Run these with an N|Solid binary built from the revision being measured:

```console
./nsolid benchmark/run.js nsolid
```

`tracing-ids.js` measures native span/trace ID generation using reusable,
explicitly backed views. `threads=1` runs on the main thread; `threads=4`
uses four workers and reports aggregate IDs per second. Worker startup and
warmup are excluded from timing.

`tracing-spans.js` measures unsampled root/child `startSpan()` and `end()`
calls with explicit contexts. It exercises the built-in JavaScript ID
helpers without measuring exporters or network work.

Use the standard comparison tool to collect repeated observations:

```console
./nsolid benchmark/compare.js --old ./nsolid-before --new ./nsolid-after \
  --filter tracing-ids --runs 10 nsolid > tracing.csv
Rscript benchmark/compare.R < tracing.csv
```

Use `--filter tracing-spans` to select the span-lifecycle benchmark instead.
For older builds whose tracing helpers pass on-heap views to fast callbacks,
set `NODE_BENCHMARK_FLAGS=--no-turbo-fast-api-calls` on the comparison command
to disable fast API calls on both sides of the span comparison.

## Common API

The common.js module is used by benchmarks for consistency across repeated
tasks. It has a number of helpful functions and properties to help with
writing benchmarks.

### `createBenchmark(fn, configs[, options])`

See [the guide on writing benchmarks](../doc/contributing/writing-and-running-benchmarks.md#basics-of-a-benchmark).

### `default_http_benchmarker`

The default benchmarker used to run HTTP benchmarks.
See [the guide on writing HTTP benchmarks](../doc/contributing/writing-and-running-benchmarks.md#creating-an-http-benchmark).

### `PORT`

The default port used to run HTTP benchmarks.
See [the guide on writing HTTP benchmarks](../doc/contributing/writing-and-running-benchmarks.md#creating-an-http-benchmark).

### `sendResult(data)`

Used in special benchmarks that can't use `createBenchmark` and the object
it returns to accomplish what they need. This function reports timing
data to the parent process (usually created by running `compare.js`, `run.js` or
`scatter.js`).
