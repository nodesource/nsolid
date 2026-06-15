# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2026-06-11, Version 24.15.0-nsolid-v6.2.5 'Krypton'

### Commits

* \[[`47e5a9ed2e`](https://github.com/nodesource/nsolid/commit/47e5a9ed2e)] - **deps**: update ncm-ng to 2.9.9 (Minwoo) [#478](https://github.com/nodesource/nsolid/pull/478)

## 2026-04-30, Version 24.15.0-nsolid-v6.2.4 'Krypton'

### Commits

* \[[`dca18b3a55`](https://github.com/nodesource/nsolid/commit/dca18b3a55)] - **lib**: fix v24.15.0 merge error on present on v6.2.3 (Santiago Gimeno) [#461](https://github.com/nodesource/nsolid/pull/461)

## 2026-04-28, Version 24.15.0-nsolid-v6.2.3 'Krypton'

### Commits

* \[[`4d2ac8ff2d`](https://github.com/nodesource/nsolid/commit/4d2ac8ff2d)] - **deps**: upgrade npm to 11.13.0 (npm team) [#456](https://github.com/nodesource/nsolid/pull/456)
* \[[`8b6183edd4`](https://github.com/nodesource/nsolid/commit/8b6183edd4)] - **deps**: upgrade npm to 11.12.1 (npm team) [#456](https://github.com/nodesource/nsolid/pull/456)
* \[[`7d058566cd`](https://github.com/nodesource/nsolid/commit/7d058566cd)] - **deps**: upgrade npm to 11.11.1 (npm team) [#456](https://github.com/nodesource/nsolid/pull/456)
* \[[`2c871f6549`](https://github.com/nodesource/nsolid/commit/2c871f6549)] - **deps**: bump ncm-ng to 2.9.8 (JungMinu) [#455](https://github.com/nodesource/nsolid/pull/455)
* \[[`f49f8f9fc4`](https://github.com/nodesource/nsolid/commit/f49f8f9fc4)] - **lib,src,test**: fix race during tracing toggles (Santiago Gimeno) [#441](https://github.com/nodesource/nsolid/pull/441)
* \[[`2366f19e39`](https://github.com/nodesource/nsolid/commit/2366f19e39)] - **lib,test**: fix JS linting errors (Santiago Gimeno) [#451](https://github.com/nodesource/nsolid/pull/451)
* \[[`1ff40d7a9f`](https://github.com/nodesource/nsolid/commit/1ff40d7a9f)] - **src**: fix C++ linting issues (Santiago Gimeno) [#451](https://github.com/nodesource/nsolid/pull/451)
* \[[`20e6cad7e1`](https://github.com/nodesource/nsolid/commit/20e6cad7e1)] - **src**: replace duplicate loop hook regs (Santiago Gimeno) [#444](https://github.com/nodesource/nsolid/pull/444)
* \[[`1fec452cc9`](https://github.com/nodesource/nsolid/commit/1fec452cc9)] - **test**: fix linting in test-nsolid-file-handle-count (Santiago Gimeno) [#441](https://github.com/nodesource/nsolid/pull/441)

## 2026-03-25, Version 24.14.1-nsolid-v6.2.2 'Krypton'

### Commits

* \[[`6cf69f4539`](https://github.com/nodesource/nsolid/commit/6cf69f4539)] - Merge tag 'v24.14.1' into node-v24.14.1-nsolid-v6.2.2-release (Santiago Gimeno)

## 2026-03-02, Version 24.14.0-nsolid-v6.2.1 'Krypton'

### Commits

* \[[`252ea7fdf1`](https://github.com/nodesource/nsolid/commit/252ea7fdf1)] - Merge tag 'v24.14.0' into node-v24.14.0-nsolid-v6.2.1-release (Santiago Gimeno)
* \[[`369ce34beb`](https://github.com/nodesource/nsolid/commit/369ce34beb)] - **agents**: fix http\_client percentile calculation (Santiago Gimeno) [#424](https://github.com/nodesource/nsolid/pull/424)
* \[[`8ad264131c`](https://github.com/nodesource/nsolid/commit/8ad264131c)] - **agents**: fix infinite recursion on \~CommandStream (Santiago Gimeno) [#412](https://github.com/nodesource/nsolid/pull/412)
* \[[`c491885463`](https://github.com/nodesource/nsolid/commit/c491885463)] - **agents**: on grpc add appVersion field to info msg (Santiago Gimeno) [#413](https://github.com/nodesource/nsolid/pull/413)
* \[[`2c84a6a5ee`](https://github.com/nodesource/nsolid/commit/2c84a6a5ee)] - **agents**: fix otel-cpp warning when setting creds (Santiago Gimeno)
* \[[`a9ac92fe61`](https://github.com/nodesource/nsolid/commit/a9ac92fe61)] - **agents**: increase gRPC timeout from 10 to 60 secs (Santiago Gimeno)
* \[[`c4442b3d98`](https://github.com/nodesource/nsolid/commit/c4442b3d98)] - **build**: avoid try/except inside a loop (Santiago Gimeno) [#419](https://github.com/nodesource/nsolid/pull/419)
* \[[`9394bd4778`](https://github.com/nodesource/nsolid/commit/9394bd4778)] - **deps**: update libcurl to 8.18.0 (Santiago Gimeno) [#407](https://github.com/nodesource/nsolid/pull/407)
* \[[`80c4caf393`](https://github.com/nodesource/nsolid/commit/80c4caf393)] - **deps**: update libsodium to 1.0.21 (Santiago Gimeno) [#408](https://github.com/nodesource/nsolid/pull/408)
* \[[`c9d341d93c`](https://github.com/nodesource/nsolid/commit/c9d341d93c)] - **src**: fix null pointer deref error in SetWeak cb (Santiago Gimeno)
* \[[`edcd346843`](https://github.com/nodesource/nsolid/commit/edcd346843)] - **test**: fix failing grpc agent otel tests (Santiago Gimeno) [#421](https://github.com/nodesource/nsolid/pull/421)
* \[[`f4360e5995`](https://github.com/nodesource/nsolid/commit/f4360e5995)] - **test**: fix flaky test-grpc-continuous-profile (Santiago Gimeno) [#418](https://github.com/nodesource/nsolid/pull/418)

## 2026-01-14, Version 24.13.0-nsolid-v6.2.0 'Krypton'

### Commits

* \[[`666670a76b`](https://github.com/nodesource/nsolid/commit/666670a76b)] - Merge tag 'v24.13.0' into node-v24.13.0-nsolid-v6.1.2-release (Santiago Gimeno)
* \[[`fd7c44ee33`](https://github.com/nodesource/nsolid/commit/fd7c44ee33)] - **agents**: fix otel-cpp warning when setting creds (Santiago Gimeno)
* \[[`67b4bce062`](https://github.com/nodesource/nsolid/commit/67b4bce062)] - **agents**: increase gRPC timeout from 10 to 60 secs (Santiago Gimeno)
* \[[`7d4cbcaef1`](https://github.com/nodesource/nsolid/commit/7d4cbcaef1)] - **agents**: add option to dump grpc keylog file (Santiago Gimeno) [#406](https://github.com/nodesource/nsolid/pull/406)
* \[[`751b622cd2`](https://github.com/nodesource/nsolid/commit/751b622cd2)] - **deps**: update to protobuf v33.2 (Santiago Gimeno) [#398](https://github.com/nodesource/nsolid/pull/398)
* \[[`fcab1898d3`](https://github.com/nodesource/nsolid/commit/fcab1898d3)] - **deps**: update grpc to 1.76.0 (Santiago Gimeno) [#390](https://github.com/nodesource/nsolid/pull/390)
* \[[`1f41f13e5e`](https://github.com/nodesource/nsolid/commit/1f41f13e5e)] - **deps**: update to protobuf v33.0 (Santiago Gimeno)
* \[[`e6ed2d1e88`](https://github.com/nodesource/nsolid/commit/e6ed2d1e88)] - **deps**: update to protobuf v33.0 (Santiago Gimeno) [#389](https://github.com/nodesource/nsolid/pull/389)
* \[[`eb0e4988c6`](https://github.com/nodesource/nsolid/commit/eb0e4988c6)] - **deps**: update libcurl to 8.17.0 (Santiago Gimeno) [#388](https://github.com/nodesource/nsolid/pull/388)
* \[[`c3d5f95aaa`](https://github.com/nodesource/nsolid/commit/c3d5f95aaa)] - **lib,src**: set default metrics interval to 5 secs (Santiago Gimeno)
* \[[`2de22bbc07`](https://github.com/nodesource/nsolid/commit/2de22bbc07)] - **src**: fix null pointer deref error in SetWeak cb (Santiago Gimeno)
* \[[`ba6c1d0a3c`](https://github.com/nodesource/nsolid/commit/ba6c1d0a3c)] - **src**: set name to nsolid threads (Santiago Gimeno) [#401](https://github.com/nodesource/nsolid/pull/401)
* \[[`cb8bd50ca7`](https://github.com/nodesource/nsolid/commit/cb8bd50ca7)] - **test**: fix linting issues after v24.13.0 rebase (Santiago Gimeno)
* \[[`8116ecd9b4`](https://github.com/nodesource/nsolid/commit/8116ecd9b4)] - **test**: add grpc tests testing TLS connections (Santiago Gimeno) [#406](https://github.com/nodesource/nsolid/pull/406)

## 2025-12-08, Version 24.11.1-nsolid-v6.1.1 'Krypton'

### Commits

## 2025-12-02, Version 24.11.1-nsolid-v6.1.0 'Krypton'

### Commits

* \[[`8a9612b57a`](https://github.com/nodesource/nsolid/commit/8a9612b57a)] - Merge tag 'v24.11.1' into node-v24.11.1-nsolid-v6.1.0-release (Santiago Gimeno)
* \[[`75faeaa214`](https://github.com/nodesource/nsolid/commit/75faeaa214)] - **agents**: add runtime control for asset collection (Santiago Gimeno) [#377](https://github.com/nodesource/nsolid/pull/377)

## 2025-10-29, Version 24.11.0-nsolid-v6.0.2 'Krypton'

### Commits

* \[[`76e7b850b1`](https://github.com/nodesource/nsolid/commit/76e7b850b1)] - **agents**: improve debug logging and fix win crash (Santiago Gimeno) [#376](https://github.com/nodesource/nsolid/pull/376)
* \[[`b4449eefdd`](https://github.com/nodesource/nsolid/commit/b4449eefdd)] - **agents**: guard StartWritesDone() in grpc streams (Santiago Gimeno) [#379](https://github.com/nodesource/nsolid/pull/379)
* \[[`f1f29831de`](https://github.com/nodesource/nsolid/commit/f1f29831de)] - **build,deps**: add v8 patch management system (Santiago Gimeno) [#381](https://github.com/nodesource/nsolid/pull/381)
* \[[`25ec327a61`](https://github.com/nodesource/nsolid/commit/25ec327a61)] - **deps**: add missing files to grpc and curl gyp files (Santiago Gimeno) [#380](https://github.com/nodesource/nsolid/pull/380)
* \[[`4841cdbd1f`](https://github.com/nodesource/nsolid/commit/4841cdbd1f)] - **deps**: add missing source file to libcurl gyp (Santiago Gimeno)
* \[[`308fb1748f`](https://github.com/nodesource/nsolid/commit/308fb1748f)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [#371](https://github.com/nodesource/nsolid/pull/371)
* \[[`a08b35806d`](https://github.com/nodesource/nsolid/commit/a08b35806d)] - **deps**: update opentelemetry-cpp to 1.23.0 (Santiago Gimeno) [#371](https://github.com/nodesource/nsolid/pull/371)
* \[[`9aad7d18dd`](https://github.com/nodesource/nsolid/commit/9aad7d18dd)] - **deps**: update libcurl to 8.16.0 (Santiago Gimeno) [#370](https://github.com/nodesource/nsolid/pull/370)
* \[[`3ad39da1d1`](https://github.com/nodesource/nsolid/commit/3ad39da1d1)] - **deps**: update grpc to 1.75.0 (Santiago Gimeno) [#369](https://github.com/nodesource/nsolid/pull/369)
* \[[`9595fa4695`](https://github.com/nodesource/nsolid/commit/9595fa4695)] - **doc**: explain NSOLID\_DISABLE\_PACKAGE\_SCAN better (Santiago Gimeno) [#362](https://github.com/nodesource/nsolid/pull/362)
* \[[`48283c7351`](https://github.com/nodesource/nsolid/commit/48283c7351)] - **misc**: changes up to node-v22.18.0-nsolid-v6.0.1 (Santiago Gimeno)
* \[[`b6416a9ca9`](https://github.com/nodesource/nsolid/commit/b6416a9ca9)] - **src**: clamp idle time to avoid underflow in metrics (Santiago Gimeno) [#372](https://github.com/nodesource/nsolid/pull/372)
* \[[`60c5c58e76`](https://github.com/nodesource/nsolid/commit/60c5c58e76)] - **test**: fix flaky test-grpc-packages (Santiago Gimeno) [#368](https://github.com/nodesource/nsolid/pull/368)
