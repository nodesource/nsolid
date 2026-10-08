# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2025-09-17, Version 22.18.0-nsolid-v6.0.1 'Jod'

### Commits

* \[[`ae1497da1a`](https://github.com/nodesource/nsolid/commit/ae1497da1a)] - **src**: allow missing process title in metrics update (Santiago Gimeno) [#364](https://github.com/nodesource/nsolid/pull/364)
* \[[`bd5af31a72`](https://github.com/nodesource/nsolid/commit/bd5af31a72)] - **src**: handle nameless user @ ProcessMetrics::Update (Santiago Gimeno) [#364](https://github.com/nodesource/nsolid/pull/364)

## 2025-08-27, Version 22.18.0-nsolid-v6.0.0 'Jod'

### Commits

* \[[`f4e314ce8a`](https://github.com/nodesource/nsolid/commit/f4e314ce8a)] - **deps**: bump nsolid-cli to solve vulnerabilities (Minwoo) [nodesource/nsolid-private#14](https://github.com/nodesource/nsolid-private/pull/14)
* \[[`584631271d`](https://github.com/nodesource/nsolid/commit/584631271d)] - **lib**: only use gRPC to connect to SaaS (Santiago Gimeno) [#354](https://github.com/nodesource/nsolid/pull/354)
* \[[`240a1cfa0e`](https://github.com/nodesource/nsolid/commit/240a1cfa0e)] - **deps**: update grpc to 1.74.0 (Santiago Gimeno) [#350](https://github.com/nodesource/nsolid/pull/350)
* \[[`97fb076e1d`](https://github.com/nodesource/nsolid/commit/97fb076e1d)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [#345](https://github.com/nodesource/nsolid/pull/345)
* \[[`d864541b46`](https://github.com/nodesource/nsolid/commit/d864541b46)] - **deps**: update to opentelemetry 1.22.0 (Santiago Gimeno) [#345](https://github.com/nodesource/nsolid/pull/345)
* \[[`01455a73c7`](https://github.com/nodesource/nsolid/commit/01455a73c7)] - **agents**: enable compression in GrpcAgent (Santiago Gimeno) [#346](https://github.com/nodesource/nsolid/pull/346)
* \[[`5c46fff446`](https://github.com/nodesource/nsolid/commit/5c46fff446)] - **build**: real fix for test-grpc-packages (Santiago Gimeno) [#353](https://github.com/nodesource/nsolid/pull/353)
* \[[`ef5a0be2c0`](https://github.com/nodesource/nsolid/commit/ef5a0be2c0)] - **deps**: update protobuf to 32.0 (Santiago Gimeno) [#356](https://github.com/nodesource/nsolid/pull/356)
* \[[`cd19746412`](https://github.com/nodesource/nsolid/commit/cd19746412)] - **build,deps,src**: bring back v8 abseil-cpp (Santiago Gimeno) [#349](https://github.com/nodesource/nsolid/pull/349)
* \[[`7cd022975a`](https://github.com/nodesource/nsolid/commit/7cd022975a)] - **agents**: fix crash accessing cont prof queue (Santiago Gimeno) [#348](https://github.com/nodesource/nsolid/pull/348)
* \[[`766a071519`](https://github.com/nodesource/nsolid/commit/766a071519)] - **build,test**: make test-grpc-packages pass again (Santiago Gimeno) [#352](https://github.com/nodesource/nsolid/pull/352)
* \[[`ce20cc639c`](https://github.com/nodesource/nsolid/commit/ce20cc639c)] - **tools**: fix linting in update-protobuf.sh updater (Santiago Gimeno) [#347](https://github.com/nodesource/nsolid/pull/347)
* \[[`b22a61cc32`](https://github.com/nodesource/nsolid/commit/b22a61cc32)] - **src**: add fast api call to get spanId and traceId (Santiago Gimeno) [#284](https://github.com/nodesource/nsolid/pull/284)
* \[[`2624b5265e`](https://github.com/nodesource/nsolid/commit/2624b5265e)] - **src**: add fast api calls to push span strings (Santiago Gimeno) [#289](https://github.com/nodesource/nsolid/pull/289)
* \[[`eb73b40d2b`](https://github.com/nodesource/nsolid/commit/eb73b40d2b)] - **deps**: update grpc to 1.73.1 (Santiago Gimeno) [#324](https://github.com/nodesource/nsolid/pull/324)
* \[[`12646bdcc7`](https://github.com/nodesource/nsolid/commit/12646bdcc7)] - **deps**: update protobuf to 31.1 (Santiago Gimeno) [#325](https://github.com/nodesource/nsolid/pull/325)
* \[[`35b0fc4115`](https://github.com/nodesource/nsolid/commit/35b0fc4115)] - **deps**: update libcurl to 8.15.0 (Santiago Gimeno) [#323](https://github.com/nodesource/nsolid/pull/323)
* \[[`2492fc848c`](https://github.com/nodesource/nsolid/commit/2492fc848c)] - **tools**: add script to regenerate protofiles (Santiago Gimeno) [#326](https://github.com/nodesource/nsolid/pull/326)
* \[[`308046b5ab`](https://github.com/nodesource/nsolid/commit/308046b5ab)] - **src**: add batching options to AsyncTSQueue (Santiago Gimeno) [#319](https://github.com/nodesource/nsolid/pull/319)
* \[[`6b1737fbb3`](https://github.com/nodesource/nsolid/commit/6b1737fbb3)] - **src**: optimize async notifications in enqueue (Santiago Gimeno) [#318](https://github.com/nodesource/nsolid/pull/318)
* \[[`4ba885fcfa`](https://github.com/nodesource/nsolid/commit/4ba885fcfa)] - **src**: add batched support callback in AsyncTSQueue (Santiago Gimeno) [#312](https://github.com/nodesource/nsolid/pull/312)
* \[[`c13354ceef`](https://github.com/nodesource/nsolid/commit/c13354ceef)] - **deps**: build opentelemetry-cpp with c++20 (Santiago Gimeno) [#292](https://github.com/nodesource/nsolid/pull/292)
* \[[`dd81b6d51c`](https://github.com/nodesource/nsolid/commit/dd81b6d51c)] - **deps**: update protobuf to 30.2 and grpc to 1.72.0 (Santiago Gimeno) [#303](https://github.com/nodesource/nsolid/pull/303)
* \[[`bbf0d547c9`](https://github.com/nodesource/nsolid/commit/bbf0d547c9)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [#322](https://github.com/nodesource/nsolid/pull/322)
* \[[`76f28383f2`](https://github.com/nodesource/nsolid/commit/76f28383f2)] - **deps**: update opentelemetry-cpp to 1.21.0 (Santiago Gimeno) [#322](https://github.com/nodesource/nsolid/pull/322)
* \[[`a0a2c709b2`](https://github.com/nodesource/nsolid/commit/a0a2c709b2)] - **agents**: optimize span collector message sending (Santiago Gimeno) [#287](https://github.com/nodesource/nsolid/pull/287)
* \[[`63ce33e873`](https://github.com/nodesource/nsolid/commit/63ce33e873)] - **src**: fix thread-safety issues @ ContinuousProfiler (Santiago Gimeno) [#309](https://github.com/nodesource/nsolid/pull/309)
* \[[`dcb7e63c3d`](https://github.com/nodesource/nsolid/commit/dcb7e63c3d)] - **deps**: update json to 3.12.0 (Santiago Gimeno) [#308](https://github.com/nodesource/nsolid/pull/308)
* \[[`0d88dde546`](https://github.com/nodesource/nsolid/commit/0d88dde546)] - **deps**: update libcurl to 8.13.0 (Santiago Gimeno) [#307](https://github.com/nodesource/nsolid/pull/307)
* \[[`d4cd85149f`](https://github.com/nodesource/nsolid/commit/d4cd85149f)] - **src**: store hasEbpfSupport metadata in info.proto (RafaelGSS) [#290](https://github.com/nodesource/nsolid/pull/290)
* \[[`6d8741c4f2`](https://github.com/nodesource/nsolid/commit/6d8741c4f2)] - **agents**: support `contCpuProfile` command in the GRPC interface (Juan José Arboleda) [#297](https://github.com/nodesource/nsolid/pull/297)
* \[[`4ae31aebaf`](https://github.com/nodesource/nsolid/commit/4ae31aebaf)] - **agents**: fix cont profiling timestamp calculation (Santiago Gimeno) [#302](https://github.com/nodesource/nsolid/pull/302)
* \[[`dab3bc6326`](https://github.com/nodesource/nsolid/commit/dab3bc6326)] - **test**: add gRPC continuous profiling tests (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`4bb1a08bc8`](https://github.com/nodesource/nsolid/commit/4bb1a08bc8)] - **agents**: add continuous profiling to gRPC agent (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`8de82b1c3c`](https://github.com/nodesource/nsolid/commit/8de82b1c3c)] - **agents**: grow AssetStream to support cont profiling (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`24621190c1`](https://github.com/nodesource/nsolid/commit/24621190c1)] - **agents**: add ExportContinuousProfile rpc (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`c08fd673e0`](https://github.com/nodesource/nsolid/commit/c08fd673e0)] - **test**: add continuous profiling configuration tests (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`ddc7c6b190`](https://github.com/nodesource/nsolid/commit/ddc7c6b190)] - **src**: integrate ContinuousProfiler with EnvList (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`4cda17781c`](https://github.com/nodesource/nsolid/commit/4cda17781c)] - **lib**: add continuous CPU profiling configuration (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`90409488ff`](https://github.com/nodesource/nsolid/commit/90409488ff)] - **src**: implement ContinuousProfiler class (Santiago Gimeno) [#282](https://github.com/nodesource/nsolid/pull/282)

## 2025-07-17, Version 22.17.1-nsolid-v5.7.5 'Jod'

### Commits

* \[[`1fba3de726`](https://github.com/nodesource/nsolid/commit/1fba3de726)] - Merge tag 'v22.17.1' into node-v22.17.1-nsolid-v5.7.5-release (Santiago Gimeno)
* \[[`585a50063b`](https://github.com/nodesource/nsolid/commit/585a50063b)] - **agents**: add root certs API and use it in OTLPAgent (Santiago Gimeno) [#340](https://github.com/nodesource/nsolid/pull/340)

## 2025-06-25, Version 22.15.1-nsolid-v5.7.4 'Jod'

### Commits

* \[[`e780a7d860`](https://github.com/nodesource/nsolid/commit/e780a7d860)] - **deps**: update to brace-expansion\@2.0.2 in npm (Santiago Gimeno) [#331](https://github.com/nodesource/nsolid/pull/331)

## 2025-06-23, Version 22.15.1-nsolid-v5.7.3 'Jod'

### Commits

* \[[`1cadfdec33`](https://github.com/nodesource/nsolid/commit/1cadfdec33)] - **doc**: fix changelog for node-v22.15.0-nsolid-v5.7.1 (Santiago Gimeno)
* \[[`6d6b58adc2`](https://github.com/nodesource/nsolid/commit/6d6b58adc2)] - **deps**: update minimatch to 10.0.3 (nodejs-github-bot) [#328](https://github.com/nodesource/nsolid/pull/328)

## 2025-05-15, Version 22.15.1-nsolid-v5.7.2 'Jod'

### Commits

* \[[`255e93ff55`](https://github.com/nodesource/nsolid/commit/255e93ff55)] - Merge tag 'v22.15.1' into node-v22.x-nsolid-v5.x (Santiago Gimeno)

## 2025-05-07, Version 22.15.0-nsolid-v5.7.1 'Jod'

### Commits

* \[[`7921de11aa`](https://github.com/nodesource/nsolid/commit/7921de11aa)] - Merge tag 'v22.15.0' into node-v22.x-nsolid-v5.x (Santiago Gimeno)
* \[[`d0c432e598`](https://github.com/nodesource/nsolid/commit/d0c432e598)] - **agents**: dry DelegateAsyncExport to use templates (Santiago Gimeno) [nodesource/nsolid#294](https://github.com/nodesource/nsolid/pull/294)
* \[[`354e74bf8d`](https://github.com/nodesource/nsolid/commit/354e74bf8d)] - **agents**: export extra\_attrs when using OTLP (Santiago Gimeno) [nodesource/nsolid#293](https://github.com/nodesource/nsolid/pull/293)
* \[[`fd05e11897`](https://github.com/nodesource/nsolid/commit/fd05e11897)] - **agents**: make ProfileCollector to use AsyncTSQueue (Santiago Gimeno) [nodesource/nsolid#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`78fb07e27a`](https://github.com/nodesource/nsolid/commit/78fb07e27a)] - **agents**: use AsyncTSQueue for blocked\_loop events (Santiago Gimeno) [nodesource/nsolid#279](https://github.com/nodesource/nsolid/pull/279)
* \[[`4dbec3625e`](https://github.com/nodesource/nsolid/commit/4dbec3625e)] - **agents**: fix possible grpc mutex race condition (Santiago Gimeno) [nodesource/nsolid#277](https://github.com/nodesource/nsolid/pull/277)
* \[[`c5c01e1775`](https://github.com/nodesource/nsolid/commit/c5c01e1775)] - **build**: fix grpc\_cpp\_plugin target (Santiago Gimeno) [nodesource/nsolid#291](https://github.com/nodesource/nsolid/pull/291)
* \[[`01ea515850`](https://github.com/nodesource/nsolid/commit/01ea515850)] - **deps**: update libcurl to 8.12.1 (Santiago Gimeno) [nodesource/nsolid#280](https://github.com/nodesource/nsolid/pull/280)
* \[[`783a1c904f`](https://github.com/nodesource/nsolid/commit/783a1c904f)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [nodesource/nsolid#286](https://github.com/nodesource/nsolid/pull/286)
* \[[`e2afaf418c`](https://github.com/nodesource/nsolid/commit/e2afaf418c)] - **deps**: update opentelemetry-cpp to 1.20.0 (Santiago Gimeno) [nodesource/nsolid#286](https://github.com/nodesource/nsolid/pull/286)
* \[[`3ddc4ed7d9`](https://github.com/nodesource/nsolid/commit/3ddc4ed7d9)] - **deps**: enable async otlp exporting (Santiago Gimeno) [nodesource/nsolid#278](https://github.com/nodesource/nsolid/pull/278)
* \[[`cabef5c2c8`](https://github.com/nodesource/nsolid/commit/cabef5c2c8)] - **lib**: fix undici span propagation (Santiago Gimeno) [nodesource/nsolid#276](https://github.com/nodesource/nsolid/pull/276)
* \[[`d8b8efa51b`](https://github.com/nodesource/nsolid/commit/d8b8efa51b)] - **lib**: cleanup tracing channels subscriptions (Santiago Gimeno) [nodesource/nsolid/pull/276](https://github.com/nodesource/nsolid/pull/276)
* \[[`e83552ae53`](https://github.com/nodesource/nsolid/commit/e83552ae53)] - **lib,src,test**: add http protocol version to spans (Santiago Gimeno) [nodesource/nsolid#276](https://github.com/nodesource/nsolid/pull/276)
* \[[`08f118fcad`](https://github.com/nodesource/nsolid/commit/08f118fcad)] - **src**: fix GetSourceCode for ESM file url (Santiago Gimeno) [nodesource/nsolid#296](https://github.com/nodesource/nsolid/pull/296)
* \[[`e76de7a503`](https://github.com/nodesource/nsolid/commit/e76de7a503)] - **src**: fix string encoding in some N|Solid bindings (Santiago Gimeno) [nodesource/nsolid#295](https://github.com/nodesource/nsolid/pull/295)
* \[[`7943b5c135`](https://github.com/nodesource/nsolid/commit/7943b5c135)] - **src**: harden NSolidCPUProfiler (Santiago Gimeno) [nodesource/nsolid#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`1e071a3d66`](https://github.com/nodesource/nsolid/commit/1e071a3d66)] - **src**: implement AsyncTSQueue (Santiago Gimeno) [nodesource/nsolid#279](https://github.com/nodesource/nsolid/pull/279)
* \[[`ed6ddc566e`](https://github.com/nodesource/nsolid/commit/ed6ddc566e)] - **test**: add test-grpc-reconfigure to agent tests (Santiago Gimeno) [nodesource/nsolid#298](https://github.com/nodesource/nsolid/pull/298)
* \[[`a8135cd9a9`](https://github.com/nodesource/nsolid/commit/a8135cd9a9)] - **test**: fix flaky test-otlp-grpc-metrics (Santiago Gimeno) [nodesource/nsolid#281](https://github.com/nodesource/nsolid/pull/281)
* \[[`973e241538`](https://github.com/nodesource/nsolid/commit/973e241538)] - **test**: fix flaky test-zmq-packages.mjs (Santiago Gimeno) [nodesource/nsolid#288](https://github.com/nodesource/nsolid/pull/288)
* \[[`bd4e471750`](https://github.com/nodesource/nsolid/commit/bd4e471750)] - **test**: fix nsolid-statsdagent test debug build (Santiago Gimeno) [nodesource/nsolid#277](https://github.com/nodesource/nsolid/pull/277)

## 2025-02-14, Version 22.13.1-nsolid-v5.7.0 'Jod'

### Commits

* \[[`61010483da`](https://github.com/nodesource/nsolid/commit/61010483da)] - **agents**: avoid crashing when populating packages (Santiago Gimeno) [#267](https://github.com/nodesource/nsolid/pull/267)
* \[[`ed8c4f953e`](https://github.com/nodesource/nsolid/commit/ed8c4f953e)] - **lib**: add tracing support for http2 (Santiago Gimeno) [#266](https://github.com/nodesource/nsolid/pull/266)
* \[[`63a9b6f86d`](https://github.com/nodesource/nsolid/commit/63a9b6f86d)] - **lib**: add tracing channels for http2 streams (Santiago Gimeno) [#266](https://github.com/nodesource/nsolid/pull/266)
* \[[`65430e7aaa`](https://github.com/nodesource/nsolid/commit/65430e7aaa)] - **tools**: opentelemetry-cpp updater fix (Santiago Gimeno) [#260](https://github.com/nodesource/nsolid/pull/260)
* \[[`887bd98ed5`](https://github.com/nodesource/nsolid/commit/887bd98ed5)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [#260](https://github.com/nodesource/nsolid/pull/260)
* \[[`2159f27db0`](https://github.com/nodesource/nsolid/commit/2159f27db0)] - **deps**: update opentelemetry-cpp to 1.19.0 (Santiago Gimeno) [#260](https://github.com/nodesource/nsolid/pull/260)
* \[[`4ded43b66a`](https://github.com/nodesource/nsolid/commit/4ded43b66a)] - **lib**: add metrics support for http2 (Santiago Gimeno) [#256](https://github.com/nodesource/nsolid/pull/256)
* \[[`6350b9589b`](https://github.com/nodesource/nsolid/commit/6350b9589b)] - **lib**: add diagnostic channels to http2 (Santiago Gimeno) [#256](https://github.com/nodesource/nsolid/pull/256)
* \[[`30f54e6aae`](https://github.com/nodesource/nsolid/commit/30f54e6aae)] - **agents**: fix grpc keepalive configuration (Santiago Gimeno) [#265](https://github.com/nodesource/nsolid/pull/265)
* \[[`43ed2a4403`](https://github.com/nodesource/nsolid/commit/43ed2a4403)] - **agents**: improve appName support (Santiago Gimeno) [#264](https://github.com/nodesource/nsolid/pull/264)
* \[[`0246f46386`](https://github.com/nodesource/nsolid/commit/0246f46386)] - **deps**: timeDeltas in cpu profiles are signed (Santiago Gimeno) [#254](https://github.com/nodesource/nsolid/pull/254)
* \[[`6aa537faa8`](https://github.com/nodesource/nsolid/commit/6aa537faa8)] - Working on v5.6.2 Jod (Santiago Gimeno)

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
