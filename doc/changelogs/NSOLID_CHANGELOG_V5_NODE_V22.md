# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2025-01-21, Version 22.13.1-nsolid-v5.6.1 'Jod'

### Commits

* \[[`010d8793ba`](https://github.com/nodesource/nsolid/commit/010d8793ba)] - Merge tag 'v22.13.1' into node-v22.13.1-nsolid-v5.6.1-release (Santiago Gimeno)
* \[[`3fedf3b45b`](https://github.com/nodesource/nsolid/commit/3fedf3b45b)] - **build**: disable lint-readme job (Santiago Gimeno) [#255](https://github.com/nodesource/nsolid/pull/255)
* \[[`ca97de2342`](https://github.com/nodesource/nsolid/commit/ca97de2342)] - **doc,lib,test**: fix linting issues (Santiago Gimeno) [#255](https://github.com/nodesource/nsolid/pull/255)
* \[[`06677cc004`](https://github.com/nodesource/nsolid/commit/06677cc004)] - **tools**: extend documented-errors lint rule (Santiago Gimeno) [#255](https://github.com/nodesource/nsolid/pull/255)

## 2025-01-13, Version 22.13.0-nsolid-v5.6.0 'Jod'

### Commits

* \[[`4ee0aba6b6`](https://github.com/nodesource/nsolid/commit/4ee0aba6b6)] - Merge tag 'v22.13.0' into node-v22.13.0-nsolid-v5.6.0-release (Santiago Gimeno) [#249](https://github.com/nodesource/nsolid/pull/249)
* \[[`c82802ac28`](https://github.com/nodesource/nsolid/commit/c82802ac28)] - **agents**: fix grpc insecure opt initialization (Santiago Gimeno) [#247](https://github.com/nodesource/nsolid/pull/247)
* \[[`4813152b9c`](https://github.com/nodesource/nsolid/commit/4813152b9c)] - **agents**: don't send exit if grpc agent unconfigured (Santiago Gimeno) [#248](https://github.com/nodesource/nsolid/pull/248)
* \[[`fd5e9476b0`](https://github.com/nodesource/nsolid/commit/fd5e9476b0)] - **agents**: improve SaaS token handling (Santiago Gimeno) [#237](https://github.com/nodesource/nsolid/pull/237)
* \[[`f40acf9eb2`](https://github.com/nodesource/nsolid/commit/f40acf9eb2)] - **agents**: share channel between OTLP exporters (Santiago Gimeno) [#242](https://github.com/nodesource/nsolid/pull/242)
* \[[`325536c320`](https://github.com/nodesource/nsolid/commit/325536c320)] - **deps**: update libcurl to 8.11.1 (Santiago Gimeno) [#243](https://github.com/nodesource/nsolid/pull/243)
* \[[`8cc0bb54e6`](https://github.com/nodesource/nsolid/commit/8cc0bb54e6)] - **deps**: update opentelemetry-cpp to 1.18.0 (Santiago Gimeno) [#241](https://github.com/nodesource/nsolid/pull/241)
* \[[`a4dfbf64b5`](https://github.com/nodesource/nsolid/commit/a4dfbf64b5)] - **deps**: avoid using unset values in cpu profiler (Santiago Gimeno) [#233](https://github.com/nodesource/nsolid/pull/233)
* \[[`d4047ede8f`](https://github.com/nodesource/nsolid/commit/d4047ede8f)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [#221](https://github.com/nodesource/nsolid/pull/221)
* \[[`f47334bae9`](https://github.com/nodesource/nsolid/commit/f47334bae9)] - **deps**: update opentelemetry-cpp to 1.17.0 (Santiago Gimeno) [#221](https://github.com/nodesource/nsolid/pull/221)
* \[[`2ab4a1edd9`](https://github.com/nodesource/nsolid/commit/2ab4a1edd9)] - **deps**: update undici adding code from <https://github.com/nodejs/undici/pull/2701> (Santiago Gimeno) [#216](https://github.com/nodesource/nsolid/pull/216)
* \[[`6b23418151`](https://github.com/nodesource/nsolid/commit/6b23418151)] - **lib**: fix crash if invalid SaaS token (Santiago Gimeno) [#235](https://github.com/nodesource/nsolid/pull/235)
* \[[`f8697d4c7c`](https://github.com/nodesource/nsolid/commit/f8697d4c7c)] - **lib**: add tracing support for fetch(undici) (Santiago Gimeno) [#216](https://github.com/nodesource/nsolid/pull/216)
* \[[`16c1b8c36d`](https://github.com/nodesource/nsolid/commit/16c1b8c36d)] - **lib**: add nsolidTracer EventEmitter (Santiago Gimeno) [#216](https://github.com/nodesource/nsolid/pull/216)
* \[[`c3d728159d`](https://github.com/nodesource/nsolid/commit/c3d728159d)] - **lib,src**: fix a couple of linting issues (Santiago Gimeno)
* \[[`fcf0865433`](https://github.com/nodesource/nsolid/commit/fcf0865433)] - **src**: add scriptId to stack\@blocked\_loop event (Santiago Gimeno) [#238](https://github.com/nodesource/nsolid/pull/238)
* \[[`1d1560f713`](https://github.com/nodesource/nsolid/commit/1d1560f713)] - **src,agents**: add support for source code collection (Santiago Gimeno) [#240](https://github.com/nodesource/nsolid/pull/240)
* \[[`ce9874bc02`](https://github.com/nodesource/nsolid/commit/ce9874bc02)] - **test**: unflake nsolid-env-metrics test (Santiago Gimeno) [#236](https://github.com/nodesource/nsolid/pull/236)
* \[[`20e83c7a2b`](https://github.com/nodesource/nsolid/commit/20e83c7a2b)] - **test**: fix flaky nsolid-metrics test (Santiago Gimeno) [#239](https://github.com/nodesource/nsolid/pull/239)
* \[[`5eae00f2e9`](https://github.com/nodesource/nsolid/commit/5eae00f2e9)] - **test**: get opentelemetry version from process (Santiago Gimeno) [#221](https://github.com/nodesource/nsolid/pull/221)

## 2024-11-22, Version 22.11.0-nsolid-v5.5.0 'Jod'

### Commits

* \[[`df24711dfb`](https://github.com/nodesource/nsolid/df24711dfb)] - **agents**: fix synchronized code in GrpcAgent (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`eca85a3a1a`](https://github.com/nodesource/nsolid/eca85a3a1a)] - **agents**: fix ExitEvent condition handling (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`b37f31bc6f`](https://github.com/nodesource/nsolid/b37f31bc6f)] - **agents**: add `complete` and `duration` to Asset msg (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`a1d67b2ca5`](https://github.com/nodesource/nsolid/a1d67b2ca5)] - **agents**: gRPC JS asset methods must add requestId (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`8df64fe37d`](https://github.com/nodesource/nsolid/8df64fe37d)] - **deps**: avoid overflow when calculating timeDeltas (Santiago Gimeno) [nodesource/nsolid#229](https://github.com/nodesource/nsolid/pull/229)
* \[[`d95c588976`](https://github.com/nodesource/nsolid/d95c588976)] - **deps**: escape funtionName in CPU Profiles (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`41ae8bd7f1`](https://github.com/nodesource/nsolid/41ae8bd7f1)] - **deps**: fix Windows 11 SDK compilation (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`47e827103f`](https://github.com/nodesource/nsolid/47e827103f)] - **deps**: update grpc to 1.67.1 (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`b1762942cf`](https://github.com/nodesource/nsolid/b1762942cf)] - **deps**: update libsodium to 1.0.20 (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`61c29d909e`](https://github.com/nodesource/nsolid/61c29d909e)] - **deps**: update to libcurl 8.11.0 (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`61b25269fc`](https://github.com/nodesource/nsolid/61b25269fc)] - **deps,tools**: add missing grpc compiler folder (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`26c6b12b99`](https://github.com/nodesource/nsolid/26c6b12b99)] - **lib**: make sure only gRPC or ZMQ connects to SaaS (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`77c03836cb`](https://github.com/nodesource/nsolid/77c03836cb)] - **test**: fix linting issues (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`fc018154ca`](https://github.com/nodesource/nsolid/fc018154ca)] - **test**: unflake test-nsolid asset tests (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)
* \[[`1d60b95003`](https://github.com/nodesource/nsolid/1d60b95003)] - **test**: backport missing tests from v20.x (Santiago Gimeno) [nodesource/nsolid#212](https://github.com/nodesource/nsolid/pull/212)
* \[[`bbc12fcad2`](https://github.com/nodesource/nsolid/bbc12fcad2)] - **tools**: fix CURRENT\_VERSION calculation (Santiago Gimeno) [nodesource/nsolid#225](https://github.com/nodesource/nsolid/pull/225)

## 2024-11-01, Version 22.11.0-nsolid-v5.4.0 'Jod'

### Commits

* \[[`c1c0a32c78`](https://github.com/nodesource/nsolid/commit/c1c0a32c78)] - 2024-11-01, Version 22.11.0-nsolid-v5.4.0 'Jod' (Trevor Norris) [nodesource/nsolid#207](https://github.com/nodesource/nsolid/pull/207)
* \[[`85c7c468c8`](https://github.com/nodesource/nsolid/commit/85c7c468c8)] - **lib,src,test**: fix linting issues (Santiago Gimeno) [nodesource/nsolid#207](https://github.com/nodesource/nsolid/pull/207)
* \[[`7ea94446d6`](https://github.com/nodesource/nsolid/commit/7ea94446d6)] - **agents**: fix deadlock on CommandStream destruction (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`4953e5d372`](https://github.com/nodesource/nsolid/commit/4953e5d372)] - **lib**: validate NSOLID\_GRPC value (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`f1a038755d`](https://github.com/nodesource/nsolid/commit/f1a038755d)] - **test**: add gRPC agent tests (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`8d93440d5a`](https://github.com/nodesource/nsolid/commit/8d93440d5a)] - **lib,src**: gRPCAgent integration in N|Solid (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`049fa3efc1`](https://github.com/nodesource/nsolid/commit/049fa3efc1)] - **agents**: implement JS bindings to the gRPC Agent (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`3cfdd95fe7`](https://github.com/nodesource/nsolid/commit/3cfdd95fe7)] - **agents**: GrpcAgent initial implementation (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`63ef223b9f`](https://github.com/nodesource/nsolid/commit/63ef223b9f)] - **agents**: implement AssetStream class (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`136181f1b5`](https://github.com/nodesource/nsolid/commit/136181f1b5)] - **agents**: implement CommandStream class (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`47b8b39e69`](https://github.com/nodesource/nsolid/commit/47b8b39e69)] - **agents**: add GrpcClient implementation (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`92aca9a626`](https://github.com/nodesource/nsolid/commit/92aca9a626)] - **agents**: add protofiles for GRPCAgent service (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`37f56c9060`](https://github.com/nodesource/nsolid/commit/37f56c9060)] - **lib**: add counter support for undici fetch() (Santiago Gimeno) [nodesource/nsolid#204](https://github.com/nodesource/nsolid/pull/204)
* \[[`214b53909f`](https://github.com/nodesource/nsolid/commit/214b53909f)] - **agents**: remove debug log leftover (Santiago Gimeno) [nodesource/nsolid#206](https://github.com/nodesource/nsolid/pull/206)
* \[[`301139efaf`](https://github.com/nodesource/nsolid/commit/301139efaf)] - **src**: remove timeOriginTimestamp from startupTimes (Santiago Gimeno) [nodesource/nsolid#202](https://github.com/nodesource/nsolid/pull/202)
* \[[`504392f8ab`](https://github.com/nodesource/nsolid/commit/504392f8ab)] - **src**: change internal GetStartupTimes() signature (Santiago Gimeno) [nodesource/nsolid#202](https://github.com/nodesource/nsolid/pull/202)
* \[[`6634675f78`](https://github.com/nodesource/nsolid/commit/6634675f78)] - **agents**: use correct unit (ns) for log timestamp (Santiago Gimeno) [nodesource/nsolid#201](https://github.com/nodesource/nsolid/pull/201)
* \[[`2bf0d28f60`](https://github.com/nodesource/nsolid/commit/2bf0d28f60)] - **lib**: move assets JS API interface to lib/internal (Santiago Gimeno) [nodesource/nsolid#200](https://github.com/nodesource/nsolid/pull/200)
* \[[`4d9fc16eb6`](https://github.com/nodesource/nsolid/commit/4d9fc16eb6)] - **deps**: fix grpc\_cpp\_plugin build (Santiago Gimeno) [nodesource/nsolid#199](https://github.com/nodesource/nsolid/pull/199)
* \[[`3e0d42577f`](https://github.com/nodesource/nsolid/commit/3e0d42577f)] - **deps**: update json to 3.11.3 (Santiago Gimeno) [nodesource/nsolid#165](https://github.com/nodesource/nsolid/pull/165)
* \[[`56d633bd5a`](https://github.com/nodesource/nsolid/commit/56d633bd5a)] - **doc**: fix linting issue (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`eba98a6332`](https://github.com/nodesource/nsolid/commit/eba98a6332)] - **agents**: add nsolid.span\_kind attribute to Spans (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`41f4153b47`](https://github.com/nodesource/nsolid/commit/41f4153b47)] - **agents**: make metrics name format configure (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`b46b443d42`](https://github.com/nodesource/nsolid/commit/b46b443d42)] - **agents**: move text metrics calculation to common (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`2d06d1a152`](https://github.com/nodesource/nsolid/commit/2d06d1a152)] - **agents**: fix linting issue (Santiago Gimeno) [nodesource/nsolid#196](https://github.com/nodesource/nsolid/pull/196)
* \[[`152937e938`](https://github.com/nodesource/nsolid/commit/152937e938)] - **agents**: fix otlp endpoint calculation (Santiago Gimeno) [nodesource/nsolid#194](https://github.com/nodesource/nsolid/pull/194)
* \[[`b83ac5283c`](https://github.com/nodesource/nsolid/commit/b83ac5283c)] - **agents**: add missing text metrics (Santiago Gimeno) [nodesource/nsolid#193](https://github.com/nodesource/nsolid/pull/193)
* \[[`188c766976`](https://github.com/nodesource/nsolid/commit/188c766976)] - **src**: set release as LTS (Trevor Norris)
