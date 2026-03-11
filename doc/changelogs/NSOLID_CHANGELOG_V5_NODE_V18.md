# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2026-05-11, Version 18.20.8-nsolid-v5.7.3 'Hydrogen'

### Commits

* \[[`c01509b676`](https://github.com/nodesource/nsolid/commit/c01509b676)] - **agents**: fix http\_client percentile calculation (Santiago Gimeno) [#424](https://github.com/nodesource/nsolid/pull/424)
* \[[`d3d6763a34`](https://github.com/nodesource/nsolid/commit/d3d6763a34)] - **agents**: fix infinite recursion on \~CommandStream (Santiago Gimeno) [#412](https://github.com/nodesource/nsolid/pull/412)
* \[[`0551f600cc`](https://github.com/nodesource/nsolid/commit/0551f600cc)] - **agents**: on grpc add appVersion field to info msg (Santiago Gimeno) [#413](https://github.com/nodesource/nsolid/pull/413)
* \[[`39676ed055`](https://github.com/nodesource/nsolid/commit/39676ed055)] - **agents**: increase gRPC timeout from 10 to 60 secs (Santiago Gimeno)
* \[[`8596d3eb61`](https://github.com/nodesource/nsolid/commit/8596d3eb61)] - **agents**: enable compression in GrpcAgent (Santiago Gimeno) [#346](https://github.com/nodesource/nsolid/pull/346)
* \[[`90903da41e`](https://github.com/nodesource/nsolid/commit/90903da41e)] - **agents**: add root certs API and use it in OTLPAgent (Santiago Gimeno) [#340](https://github.com/nodesource/nsolid/pull/340)
* \[[`7b28ea94e1`](https://github.com/nodesource/nsolid/commit/7b28ea94e1)] - **lib,src**: set default metrics interval to 5 secs (Santiago Gimeno)
* \[[`aa69b59634`](https://github.com/nodesource/nsolid/commit/aa69b59634)] - **src**: fix null pointer deref error in SetWeak cb (Santiago Gimeno)
* \[[`ee28be19b3`](https://github.com/nodesource/nsolid/commit/ee28be19b3)] - **src**: store hasEbpfSupport metadata in info.proto (RafaelGSS) [#290](https://github.com/nodesource/nsolid/pull/290)
* \[[`bf8201a4e4`](https://github.com/nodesource/nsolid/commit/bf8201a4e4)] - **test**: fix failing grpc agent otel tests (Santiago Gimeno) [#421](https://github.com/nodesource/nsolid/pull/421)

## 2025-09-17, Version 18.20.8-nsolid-v5.7.2 'Hydrogen'

### Commits

* \[[`7ffa141691`](https://github.com/nsolid/node/commit/7ffa141691)] - **src**: allow missing process title in metrics update (Santiago Gimeno) [nodesource/nsolid#364](https://github.com/nodesource/nsolid/pull/364)
* \[[`c997c60fb6`](https://github.com/nsolid/node/commit/c997c60fb6)] - **src**: handle nameless user @ ProcessMetrics::Update (Santiago Gimeno) [nodesource/nsolid#364](https://github.com/nodesource/nsolid/pull/364)

## 2025-05-07, Version 18.20.8-nsolid-v5.7.1 'Hydrogen'

### Commits

* \[[`df1109bbe0`](https://github.com/nsolid/node/commit/df1109bbe0)] - Merge tag 'v18.20.8' into node-v18.x-nsolid-v5.x (Santiago Gimeno)
* \[[`e8c0de55bf`](https://github.com/nsolid/node/commit/e8c0de55bf)] - **agents**: dry DelegateAsyncExport to use templates (Santiago Gimeno) [nodesource/nsolid#294](https://github.com/nodesource/nsolid/pull/294)
* \[[`f8166a2531`](https://github.com/nsolid/node/commit/f8166a2531)] - **agents**: export extra\_attrs when using OTLP (Santiago Gimeno) [nodesource/nsolid#293](https://github.com/nodesource/nsolid/pull/293)
* \[[`c33f26c447`](https://github.com/nsolid/node/commit/c33f26c447)] - **agents**: make ProfileCollector to use AsyncTSQueue (Santiago Gimeno) [nodesource/nsolid#282](https://github.com/nodesource/nsolid/pull/282)
* \[[`b30d396d8e`](https://github.com/nsolid/node/commit/b30d396d8e)] - **agents**: use AsyncTSQueue for blocked\_loop events (Santiago Gimeno) [nodesource/nsolid#279](https://github.com/nodesource/nsolid/pull/279)
* \[[`6b1f1a236d`](https://github.com/nsolid/node/commit/6b1f1a236d)] - **agents**: fix possible grpc mutex race condition (Santiago Gimeno) [nodesource/nsolid#277](https://github.com/nodesource/nsolid/pull/277)
* \[[`fb17441c5d`](https://github.com/nsolid/node/commit/fb17441c5d)] - **build**: fix grpc\_cpp\_plugin target (Santiago Gimeno) [nodesource/nsolid#291](https://github.com/nodesource/nsolid/pull/291)
* \[[`eb9f09badb`](https://github.com/nsolid/node/commit/eb9f09badb)] - **deps**: update libcurl to 8.12.1 (Santiago Gimeno) [nodesource/nsolid#280](https://github.com/nodesource/nsolid/pull/280)
* \[[`66d9bff083`](https://github.com/nsolid/node/commit/66d9bff083)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [nodesource/nsolid#286](https://github.com/nodesource/nsolid/pull/286)
* \[[`35e19eef25`](https://github.com/nsolid/node/commit/35e19eef25)] - **deps**: update opentelemetry-cpp to 1.20.0 (Santiago Gimeno) [nodesource/nsolid#286](https://github.com/nodesource/nsolid/pull/286)
* \[[`4007418c2a`](https://github.com/nsolid/node/commit/4007418c2a)] - **deps**: enable async otlp exporting (Santiago Gimeno) [nodesource/nsolid#278](https://github.com/nodesource/nsolid/pull/278)
* \[[`dc189b0838`](https://github.com/nsolid/node/commit/dc189b0838)] - **lib**: cleanup tracing channels subscriptions (Santiago Gimeno) [nodesource/nsolid#276](https://github.com/nodesource/nsolid/pull/276)
* \[[`df1a1f4b55`](https://github.com/nsolid/node/commit/df1a1f4b55)] - **lib,src,test**: add http protocol version to spans (Santiago Gimeno) [nodesource/nsolid#276](https://github.com/nodesource/nsolid/pull/276)
* \[[`ee34abbf66`](https://github.com/nsolid/node/commit/ee34abbf66)] - **src**: fix string encoding in some N|Solid bindings (Santiago Gimeno) [nodesource/nsolid#295](https://github.com/nodesource/nsolid/pull/295)
* \[[`23209c99a7`](https://github.com/nsolid/node/commit/23209c99a7)] - **src**: implement AsyncTSQueue (Santiago Gimeno) [nodesource/nsolid#279](https://github.com/nodesource/nsolid/pull/279)
* \[[`76fb2de584`](https://github.com/nsolid/node/commit/76fb2de584)] - **test**: add test-grpc-reconfigure to agent tests (Santiago Gimeno) [nodesource/nsolid#298](https://github.com/nodesource/nsolid/pull/298)
* \[[`13208ed66d`](https://github.com/nsolid/node/commit/13208ed66d)] - **test**: fix flaky test-otlp-grpc-metrics (Santiago Gimeno) [nodesource/nsolid#281](https://github.com/nodesource/nsolid/pull/281)
* \[[`520d869135`](https://github.com/nsolid/node/commit/520d869135)] - **test**: fix flaky test-zmq-packages.mjs (Santiago Gimeno) [nodesource/nsolid#288](https://github.com/nodesource/nsolid/pull/288)

## 2025-02-14, Version 18.20.6-nsolid-v5.7.0 'Hydrogen'

### Commits

* \[[`d2ee311dfb`](https://github.com/nodesource/nsolid/commit/d2ee311dfb)] - **agents**: avoid crashing when populating packages (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`bbaea0060c`](https://github.com/nodesource/nsolid/commit/bbaea0060c)] - **doc**: fix linting in NSolid changelog (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`a7e64b1ec8`](https://github.com/nodesource/nsolid/commit/a7e64b1ec8)] - **lib**: add tracing support for http2 (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`6ece3efa10`](https://github.com/nodesource/nsolid/commit/6ece3efa10)] - **lib**: add nsolidTracer EventEmitter (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`4b34ba8b3d`](https://github.com/nodesource/nsolid/commit/4b34ba8b3d)] - **lib**: add \_getALS() method to AsyncLocalStorageContextManager (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`0654ca0ac4`](https://github.com/nodesource/nsolid/commit/0654ca0ac4)] - **lib**: add tracing channels for http2 streams (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`df41e66ca4`](https://github.com/nodesource/nsolid/commit/df41e66ca4)] - **tools**: opentelemetry-cpp updater fix (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`415d6f485d`](https://github.com/nodesource/nsolid/commit/415d6f485d)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`76afe5c888`](https://github.com/nodesource/nsolid/commit/76afe5c888)] - **deps**: update opentelemetry-cpp to 1.19.0 (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`5208d16537`](https://github.com/nodesource/nsolid/commit/5208d16537)] - **lib**: add metrics support for http2 (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`a61dc8ba74`](https://github.com/nodesource/nsolid/commit/a61dc8ba74)] - **lib**: add diagnostic channels to http2 (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`9b0356899b`](https://github.com/nodesource/nsolid/commit/9b0356899b)] - **agents**: fix grpc keepalive configuration (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`91dac238bd`](https://github.com/nodesource/nsolid/commit/91dac238bd)] - **agents**: improve appName support (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`eabdde8369`](https://github.com/nodesource/nsolid/commit/eabdde8369)] - **deps**: timeDeltas in cpu profiles are signed (Santiago Gimeno) [#269](https://github.com/nodesource/nsolid/pull/269)
* \[[`c733e9ceb1`](https://github.com/nodesource/nsolid/commit/c733e9ceb1)] - Working on v5.6.2 Hydrogen (Santiago Gimeno)

## 2025-01-13, Version 18.20.5-nsolid-v5.6.0 'Hydrogen'

### Commits

* \[[`5d97793cfe`](https://github.com/nsolid/node/commit/5d97793cfe)] - **agents**: fix grpc insecure opt initialization (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`5d115d3ebe`](https://github.com/nsolid/node/commit/5d115d3ebe)] - **agents**: don't send exit if grpc agent unconfigured (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`a0318dcf4c`](https://github.com/nsolid/node/commit/a0318dcf4c)] - **agents**: improve SaaS token handling (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`a7aebe128f`](https://github.com/nsolid/node/commit/a7aebe128f)] - **agents**: share channel between OTLP exporters (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`16871b3851`](https://github.com/nsolid/node/commit/16871b3851)] - **deps**: update libcurl to 8.11.1 (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`24dbbcd177`](https://github.com/nsolid/node/commit/24dbbcd177)] - **deps**: update opentelemetry-cpp to 1.18.0 (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`426cb3adc5`](https://github.com/nsolid/node/commit/426cb3adc5)] - **deps**: avoid using unset values in cpu profiler (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`ec137295fd`](https://github.com/nsolid/node/commit/ec137295fd)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`14027b4718`](https://github.com/nsolid/node/commit/14027b4718)] - **deps**: update opentelemetry-cpp to 1.17.0 (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`86cb64d8d1`](https://github.com/nsolid/node/commit/86cb64d8d1)] - **lib**: fix crash if invalid SaaS token (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`e3d886ce29`](https://github.com/nsolid/node/commit/e3d886ce29)] - **lib,src**: fix a couple of linting issues (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`2d075bbcb2`](https://github.com/nsolid/node/commit/2d075bbcb2)] - **src**: add scriptId to stack\@blocked\_loop event (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`5afd8c91fb`](https://github.com/nsolid/node/commit/5afd8c91fb)] - **src,agents**: add support for source code collection (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`c2aa6505fe`](https://github.com/nsolid/node/commit/c2aa6505fe)] - **test**: unflake nsolid-env-metrics test (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`7c51bd933f`](https://github.com/nsolid/node/commit/7c51bd933f)] - **test**: fix flaky nsolid-metrics test (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)
* \[[`a1ebfb0555`](https://github.com/nsolid/node/commit/a1ebfb0555)] - **test**: get opentelemetry version from process (Santiago Gimeno) [nodesource/nsolid#246](https://github.com/nodesource/nsolid/pull/246)

## 2024-10-22, Version 5.5.0 'Hydrogen'

* \[[`fdbc9e27e2`](https://github.com/nodesource/nsolid/commit/fdbc9e27e2)] - **agents**: fix synchronized code in GrpcAgent (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`6f696b6a1b`](https://github.com/nodesource/nsolid/commit/6f696b6a1b)] - **agents**: fix ExitEvent condition handling (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`7645bb1e6c`](https://github.com/nodesource/nsolid/commit/7645bb1e6c)] - **agents**: add `complete` and `duration` to Asset msg (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`531d7127e9`](https://github.com/nodesource/nsolid/commit/531d7127e9)] - **agents**: gRPC JS asset methods must add requestId (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`59340cc086`](https://github.com/nodesource/nsolid/commit/59340cc086)] - **deps**: avoid overflow when calculating timeDeltas (Santiago Gimeno) [nodesource/nsolid#229](https://github.com/nodesource/nsolid/pull/229)
* \[[`fea348149e`](https://github.com/nodesource/nsolid/commit/fea348149e)] - **deps**: escape funtionName in CPU Profiles (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`3ab51742cc`](https://github.com/nodesource/nsolid/commit/3ab51742cc)] - **deps**: fix Windows 11 SDK compilation (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`d306fc8b50`](https://github.com/nodesource/nsolid/commit/d306fc8b50)] - **deps**: update grpc to 1.67.1 (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`7de95689b9`](https://github.com/nodesource/nsolid/commit/7de95689b9)] - **deps**: update libsodium to 1.0.20 (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`1ba7460834`](https://github.com/nodesource/nsolid/commit/1ba7460834)] - **deps**: update to libcurl 8.11.0 (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`db02d23cec`](https://github.com/nodesource/nsolid/commit/db02d23cec)] - **deps,tools**: add missing grpc compiler folder (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`ed40d7332a`](https://github.com/nodesource/nsolid/commit/ed40d7332a)] - **lib**: make sure only gRPC or ZMQ connects to SaaS (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`3dbbe29699`](https://github.com/nodesource/nsolid/commit/3dbbe29699)] - **test**: unflake test-nsolid asset tests (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)
* \[[`9326c24f53`](https://github.com/nodesource/nsolid/commit/9326c24f53)] - **tools**: fix CURRENT\_VERSION calculation (Santiago Gimeno) [nodesource/nsolid#224](https://github.com/nodesource/nsolid/pull/224)

## 2024-11-01, Version 5.4.0 'Hydrogen'

* \[[`e05b8cfa96`](https://github.com/nodesource/nsolid/commit/e05b8cfa96)] - **src**: remove unintended code added during backport (Santiago Gimeno) [nodesource/nsolid#208](https://github.com/nodesource/nsolid/pull/208)
* \[[`29f64f6946`](https://github.com/nodesource/nsolid/commit/29f64f6946)] - **test**: adapt grpc agent tests to v18 (Santiago Gimeno) [nodesource/nsolid#208](https://github.com/nodesource/nsolid/pull/208)
* \[[`502b6c57ea`](https://github.com/nodesource/nsolid/commit/502b6c57ea)] - **agents**: fix deadlock on CommandStream destruction (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`36d5103ec1`](https://github.com/nodesource/nsolid/commit/36d5103ec1)] - **lib**: validate NSOLID\_GRPC value (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`b098485dd1`](https://github.com/nodesource/nsolid/commit/b098485dd1)] - **test**: add gRPC agent tests (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`e3005a3682`](https://github.com/nodesource/nsolid/commit/e3005a3682)] - **lib,src**: gRPCAgent integration in N|Solid (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`37f4eaac2d`](https://github.com/nodesource/nsolid/commit/37f4eaac2d)] - **agents**: implement JS bindings to the gRPC Agent (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`a6357514ef`](https://github.com/nodesource/nsolid/commit/a6357514ef)] - **agents**: GrpcAgent initial implementation (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`d0c57ca226`](https://github.com/nodesource/nsolid/commit/d0c57ca226)] - **agents**: implement AssetStream class (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`008d9a2cf4`](https://github.com/nodesource/nsolid/commit/008d9a2cf4)] - **agents**: implement CommandStream class (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`e34d0950d2`](https://github.com/nodesource/nsolid/commit/e34d0950d2)] - **agents**: add GrpcClient implementation (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`c2a8299fd0`](https://github.com/nodesource/nsolid/commit/c2a8299fd0)] - **agents**: add protofiles for GRPCAgent service (Santiago Gimeno) [nodesource/nsolid#203](https://github.com/nodesource/nsolid/pull/203)
* \[[`d6ec8c2ca8`](https://github.com/nodesource/nsolid/commit/d6ec8c2ca8)] - **lib**: add counter support for undici fetch() (Santiago Gimeno) [nodesource/nsolid#204](https://github.com/nodesource/nsolid/pull/204)
* \[[`064d942aec`](https://github.com/nodesource/nsolid/commit/064d942aec)] - **agents**: remove debug log leftover (Santiago Gimeno) [nodesource/nsolid#206](https://github.com/nodesource/nsolid/pull/206)
* \[[`814bb41556`](https://github.com/nodesource/nsolid/commit/814bb41556)] - **src**: remove timeOriginTimestamp from startupTimes (Santiago Gimeno) [nodesource/nsolid#202](https://github.com/nodesource/nsolid/pull/202)
* \[[`dc70274bdd`](https://github.com/nodesource/nsolid/commit/dc70274bdd)] - **src**: change internal GetStartupTimes() signature (Santiago Gimeno) [nodesource/nsolid#202](https://github.com/nodesource/nsolid/pull/202)
* \[[`24cfad87a5`](https://github.com/nodesource/nsolid/commit/24cfad87a5)] - **agents**: use correct unit (ns) for log timestamp (Santiago Gimeno) [nodesource/nsolid#201](https://github.com/nodesource/nsolid/pull/201)
* \[[`936e538619`](https://github.com/nodesource/nsolid/commit/936e538619)] - **lib**: move assets JS API interface to lib/internal (Santiago Gimeno) [nodesource/nsolid#200](https://github.com/nodesource/nsolid/pull/200)
* \[[`185a18fffe`](https://github.com/nodesource/nsolid/commit/185a18fffe)] - **deps**: fix grpc\_cpp\_plugin build (Santiago Gimeno) [nodesource/nsolid#199](https://github.com/nodesource/nsolid/pull/199)
* \[[`3c0dfb603a`](https://github.com/nodesource/nsolid/commit/3c0dfb603a)] - **deps**: update json to 3.11.3 (Santiago Gimeno) [nodesource/nsolid#165](https://github.com/nodesource/nsolid/pull/165)
* \[[`0ba090bce4`](https://github.com/nodesource/nsolid/commit/0ba090bce4)] - **doc**: fix linting issue (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`8feb1cfc87`](https://github.com/nodesource/nsolid/commit/8feb1cfc87)] - **agents**: add nsolid.span\_kind attribute to Spans (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`8457860a02`](https://github.com/nodesource/nsolid/commit/8457860a02)] - **agents**: make metrics name format configure (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`830a2c664c`](https://github.com/nodesource/nsolid/commit/830a2c664c)] - **agents**: move text metrics calculation to common (Santiago Gimeno) [nodesource/nsolid#198](https://github.com/nodesource/nsolid/pull/198)
* \[[`3d808865eb`](https://github.com/nodesource/nsolid/commit/3d808865eb)] - **agents**: fix linting issue (Santiago Gimeno) [nodesource/nsolid#196](https://github.com/nodesource/nsolid/pull/196)
* \[[`e80fb52852`](https://github.com/nodesource/nsolid/commit/e80fb52852)] - **agents**: fix otlp endpoint calculation (Santiago Gimeno) [nodesource/nsolid#194](https://github.com/nodesource/nsolid/pull/194)
* \[[`65b3c2854f`](https://github.com/nodesource/nsolid/commit/65b3c2854f)] - **agents**: add missing text metrics (Santiago Gimeno) [nodesource/nsolid#193](https://github.com/nodesource/nsolid/pull/193)
* \[[`1580e29525`](https://github.com/nodesource/nsolid/commit/1580e29525)] - **agents**: fix ZmqAgent asset JS API (Santiago Gimeno) [nodesource/nsolid#192](https://github.com/nodesource/nsolid/pull/192)
* \[[`c5426499fa`](https://github.com/nodesource/nsolid/commit/c5426499fa)] - **build**: reclaim disk space on macOS GHA runner (jakecastelli) [nodesource/nsolid#182](https://github.com/nodesource/nsolid/pull/182)

## 2024-10-04, Version 5.3.4 'Hydrogen'

### Commits

* \[[`9fe792f913`](https://github.com/nodesource/nsolid/commit/9fe792f913)] - **build**: enable commit-queue (RafaelGSS) [nodesource/nsolid#187](https://github.com/nodesource/nsolid/pull/187)
* \[[`3c395676f5`](https://github.com/nodesource/nsolid/commit/3c395676f5)] - **doc**: add project members (RafaelGSS) [nodesource/nsolid#188](https://github.com/nodesource/nsolid/pull/188)
* \[[`82c282f25a`](https://github.com/nodesource/nsolid/commit/82c282f25a)] - **src**: add protobuf to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`eb3598a386`](https://github.com/nodesource/nsolid/commit/eb3598a386)] - **src**: add libsodium to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`5c53474fe6`](https://github.com/nodesource/nsolid/commit/5c53474fe6)] - **src**: add grpc to process.versions (Santiago Gimeno) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`dc9f508d6d`](https://github.com/nodesource/nsolid/commit/dc9f508d6d)] - **src**: add zmq to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`a5ba9bc34f`](https://github.com/nodesource/nsolid/commit/a5ba9bc34f)] - **src**: add opentelemetry to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`ef5c0e03c0`](https://github.com/nodesource/nsolid/commit/ef5c0e03c0)] - **src**: add nlohmann to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`3e1f93c0ef`](https://github.com/nodesource/nsolid/commit/3e1f93c0ef)] - **src**: add curl to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`8d586da799`](https://github.com/nodesource/nsolid/commit/8d586da799)] - **agents**: use OTLP Summary for percentile metrics (Santiago Gimeno) [nodesource/nsolid#180](https://github.com/nodesource/nsolid/pull/180)
* \[[`908739690c`](https://github.com/nodesource/nsolid/commit/908739690c)] - **deps**: add support for exporting Summary via OTLP (Santiago Gimeno) [nodesource/nsolid#180](https://github.com/nodesource/nsolid/pull/180)
* \[[`bda87b6617`](https://github.com/nodesource/nsolid/commit/bda87b6617)] - **lib**: check min value for sampleInterval and duration (RafaelGSS) [nodesource/nsolid#173](https://github.com/nodesource/nsolid/pull/173)
* \[[`115727d7a6`](https://github.com/nodesource/nsolid/commit/115727d7a6)] - **build**: disable get-released-versions for nsolid (RafaelGSS) [nodesource/nsolid#174](https://github.com/nodesource/nsolid/pull/174)
* \[[`f223ed21ab`](https://github.com/nodesource/nsolid/commit/f223ed21ab)] - **build**: fix lint-sh (RafaelGSS) [nodesource/nsolid#176](https://github.com/nodesource/nsolid/pull/176)
* \[[`a668341994`](https://github.com/nodesource/nsolid/commit/a668341994)] - **agents**: refactor ZmqAgent to use ProfileCollector (Santiago Gimeno) [nodesource/nsolid#161](https://github.com/nodesource/nsolid/pull/161)
* \[[`e008c041a7`](https://github.com/nodesource/nsolid/commit/e008c041a7)] - **agents**: implement ProfileCollector class (Santiago Gimeno) [nodesource/nsolid#161](https://github.com/nodesource/nsolid/pull/161)

## 2024-08-23, Version 5.3.3 'Hydrogen'

### Commits

* \[[`656531dc91`](https://github.com/nodesource/nsolid/commit/656531dc91)] - **src**: fix heapSampling crash if sampleInterval is 0 (Santiago Gimeno) [nodesource/nsolid#171](https://github.com/nodesource/nsolid/pull/171)
* \[[`78f2c64ea4`](https://github.com/nodesource/nsolid/commit/78f2c64ea4)] - **benchmark**: fix napi/ref addon (Michaël Zasso) [#53233](https://github.com/nodejs/node/pull/53233)
* \[[`a359ecbf88`](https://github.com/nodesource/nsolid/commit/a359ecbf88)] - **agents**: fix process\_start calculation (Santiago Gimeno) [nodesource/nsolid#169](https://github.com/nodesource/nsolid/pull/169)
* \[[`8c531100a8`](https://github.com/nodesource/nsolid/commit/8c531100a8)] - **agents**: implement SpanCollector helper class (Santiago Gimeno) [nodesource/nsolid#160](https://github.com/nodesource/nsolid/pull/160)
* \[[`fda0c4e6f5`](https://github.com/nodesource/nsolid/commit/fda0c4e6f5)] - **agents**: preliminar changes to support logs in otlp (Santiago Gimeno) [nodesource/nsolid#152](https://github.com/nodesource/nsolid/pull/152)
* \[[`a72fc834f1`](https://github.com/nodesource/nsolid/commit/a72fc834f1)] - **test**: include missing \<algorithm> header (Santiago Gimeno) [nodesource/nsolid#159](https://github.com/nodesource/nsolid/pull/159)
* \[[`b63755cf92`](https://github.com/nodesource/nsolid/commit/b63755cf92)] - **deps**: update grpc to 1.65.2 (Santiago Gimeno) [nodesource/nsolid#159](https://github.com/nodesource/nsolid/pull/159)
* \[[`6a9847cf86`](https://github.com/nodesource/nsolid/commit/6a9847cf86)] - **tools**: add update-grpc updater (Santiago Gimeno) [nodesource/nsolid#159](https://github.com/nodesource/nsolid/pull/159)
* \[[`6089251c61`](https://github.com/nodesource/nsolid/commit/6089251c61)] - **agents**: refactor out some otlp methods (Santiago Gimeno) [nodesource/nsolid#151](https://github.com/nodesource/nsolid/pull/151)
* \[[`bef35400dd`](https://github.com/nodesource/nsolid/commit/bef35400dd)] - **doc**: fix NSOLID\_CHANGELOG\_V5\_NODE\_V20 format (Santiago Gimeno) [nodesource/nsolid#148](https://github.com/nodesource/nsolid/pull/148)
* \[[`b76cfe6902`](https://github.com/nodesource/nsolid/commit/b76cfe6902)] - **deps**: update opentelemetry-cpp to 1.16.0 (Santiago Gimeno) [nodesource/nsolid#148](https://github.com/nodesource/nsolid/pull/148)

## 2024-07-24, Version 5.3.2 'Hydrogen'

### Commits

* \[[`3cdcd18567`](https://github.com/nodesource/nsolid/commit/3cdcd18567)] - **src:** initialize prev\_idle\_time\_ on ThreadMetrics (Santiago Gimeno) [nodesource/nsolid#156](https://github.com/nodesource/nsolid/pull/156)

### Commits

## 2024-07-08, Version 5.3.1 'Hydrogen'

### Commits

* \[[`e518606147`](https://github.com/nodesource/nsolid/commit/e518606147)] - Merge tag 'v18.20.4' into node-v18.20.4-nsolid-v5.3.1-release

### Commits

## 2024-06-24, Version 5.3.0 'Hydrogen'

### Commits

* \[[`de947a9d97`](https://github.com/nodesource/nsolid/commit/de947a9d97)] - **test**: fix flaky test when run under load (Trevor Norris) [nodesource/nsolid#144](https://github.com/nodesource/nsolid/pull/144)
* \[[`dd80b8c764`](https://github.com/nodesource/nsolid/commit/dd80b8c764)] - **test**: fix flaky test-otlp-metrics.mjs (Santiago Gimeno) [nodesource/nsolid#143](https://github.com/nodesource/nsolid/pull/143)
* \[[`e2e2084a61`](https://github.com/nodesource/nsolid/commit/e2e2084a61)] - **agents**: get telemetry data even if no cmd handle (Santiago Gimeno) [nodesource/nsolid#140](https://github.com/nodesource/nsolid/pull/140)
* \[[`8957f175c3`](https://github.com/nodesource/nsolid/commit/8957f175c3)] - **agents**: allow using OTLP env variable in OTLPAgent (Santiago Gimeno) [nodesource/nsolid#138](https://github.com/nodesource/nsolid/pull/138)
* \[[`6e2e41c837`](https://github.com/nodesource/nsolid/commit/6e2e41c837)] - **meta**: lint fixes (Trevor Norris) [nodesource/nsolid#139](https://github.com/nodesource/nsolid/pull/139)
* \[[`26c04a9c86`](https://github.com/nodesource/nsolid/commit/26c04a9c86)] - **src**: add log native and JS APIs (Trevor Norris)
* \[[`a42753a3d9`](https://github.com/nodesource/nsolid/commit/a42753a3d9)] - **agents**: add metrics transform API to agent (Trevor Norris) [nodesource/nsolid#123](https://github.com/nodesource/nsolid/pull/123)
* \[[`afbee3b15a`](https://github.com/nodesource/nsolid/commit/afbee3b15a)] - **agents**: remove start/stop from JS API (Trevor Norris) [nodesource/nsolid#123](https://github.com/nodesource/nsolid/pull/123)
* \[[`d0722ecd4b`](https://github.com/nodesource/nsolid/commit/d0722ecd4b)] - **src**: add GetAllEnvInst API (Trevor Norris) [nodesource/nsolid#123](https://github.com/nodesource/nsolid/pull/123)
* \[[`355e1b35eb`](https://github.com/nodesource/nsolid/commit/355e1b35eb)] - **agents**: enable gRPC support in OTLPAgent (Santiago Gimeno) [nodesource/nsolid#134](https://github.com/nodesource/nsolid/pull/134)
* \[[`6223134d86`](https://github.com/nodesource/nsolid/commit/6223134d86)] - **agents**: add initial gRPC support in OTLPAgent (Santiago Gimeno) [nodesource/nsolid#133](https://github.com/nodesource/nsolid/pull/133)
* \[[`02518e10b7`](https://github.com/nodesource/nsolid/commit/02518e10b7)] - **deps**: update opentelemetry-cpp to 1.15.0 (Santiago Gimeno) [nodesource/nsolid#133](https://github.com/nodesource/nsolid/pull/133)
* \[[`778c1b6440`](https://github.com/nodesource/nsolid/commit/778c1b6440)] - **deps**: add grpc\@1.52.0 (Santiago Gimeno) [nodesource/nsolid#133](https://github.com/nodesource/nsolid/pull/133)

## 2024-05-28, Version 5.2.3 'Hydrogen'

## 2024-05-21, Version 5.2.2 'Hydrogen'

### Commits

* \[[`183ee1a502`](https://github.com/nodesource/nsolid/commit/183ee1a502)] - Merge tag 'v18.20.3' into node-v18.20.3-nsolid-v5.2.2-release (Trevor Norris)

## 2024-05-09, Version 5.2.1 'Hydrogen'

### Commits

* \[[`605a64d326`](https://github.com/nodesource/nsolid/commit/605a64d326)] - **agents**: set state when writing (Trevor Norris)
* \[[`df49a91802`](https://github.com/nodesource/nsolid/commit/df49a91802)] - **agents**: make tcp/udp inherit from virtual class (Trevor Norris)
* \[[`034dca465f`](https://github.com/nodesource/nsolid/commit/034dca465f)] - **agents**: remove Disconnected (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)
* \[[`4904b06c9d`](https://github.com/nodesource/nsolid/commit/4904b06c9d)] - **agents**: have tcp/udp retry in statsd (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)
* \[[`db53362c8a`](https://github.com/nodesource/nsolid/commit/db53362c8a)] - **agents**: only create on correct protocol (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)
* \[[`073f5c75e4`](https://github.com/nodesource/nsolid/commit/073f5c75e4)] - **agents**: remove need for loop on create() (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)
* \[[`44957cdc32`](https://github.com/nodesource/nsolid/commit/44957cdc32)] - **misc**: lint fixes (Trevor Norris)

## 2024-04-10, Version 5.2.0 'Hydrogen'

### Commits

* \[[`150d4c5347`](https://github.com/nodesource/nsolid/commit/150d4c5347)] - src: fix the base case in the heap profiler JSON generation (Juan José Arboleda) [nodesource/nsolid#125](https://github.com/nodesource/nsolid/pull/125)
* \[[`1c192a295c`](https://github.com/nodesource/nsolid/commit/1c192a295c)] - lib: add nsolid JS API for heap sampling (Santiago Gimeno) [nodesource/nsolid#107](https://github.com/nodesource/nsolid/pull/107)
* \[[`c6e496094f`](https://github.com/nodesource/nsolid/commit/c6e496094f)] - Working on v5.1.3 Hydrogen (Trevor Norris)
* \[[`b86fc3caf0`](https://github.com/nodesource/nsolid/commit/b86fc3caf0)] - Merge branch 'node-v18.20.2-nsolid-v5.1.2-release' into node-v18.x-nsolid-v5.x (Trevor Norris)

## 2024-04-10, Version 5.1.2 'Hydrogen'

### Commits

* \[[`b92ae6af8e`](https://github.com/nodesource/nsolid/commit/b92ae6af8e)] - Merge tag 'v18.20.2' (Trevor Norris)

## 2024-03-27, Version 5.1.1 'Hydrogen'

### Commits

* \[[`bdabbc7d92`](https://github.com/nodesource/nsolid/commit/bdabbc7d92)] - Merge tag 'v18.20.1' into node-v18.20.1-nsolid-v5.1.1-release

## 2024-03-27, Version 5.1.0 'Hydrogen'

### Commits

* \[[`67d72793ea`](https://github.com/nodesource/nsolid/commit/67d72793ea)] - **deps**: update opentelemetry-cpp to 1.14.2 (Santiago Gimeno) [nodesource/nsolid#109](https://github.com/nodesource/nsolid/pull/109)
* \[[`ad4eb44fe3`](https://github.com/nodesource/nsolid/commit/ad4eb44fe3)] - **tools**: fix opentelemetry-cpp updater (Santiago Gimeno) [nodesource/nsolid#109](https://github.com/nodesource/nsolid/pull/109)
* \[[`2f8fab6fdf`](https://github.com/nodesource/nsolid/commit/2f8fab6fdf)] - **agents**: fix agent reconnect handshake on ZmqAgent (Santiago Gimeno) [nodesource/nsolid#105](https://github.com/nodesource/nsolid/pull/105)
* \[[`bc736d56a5`](https://github.com/nodesource/nsolid/commit/bc736d56a5)] - **test**: fix flaky nsolid-tracing test (Santiago Gimeno) [nodesource/nsolid#104](https://github.com/nodesource/nsolid/pull/104)
* \[[`77264ccefa`](https://github.com/nodesource/nsolid/commit/77264ccefa)] - **src**: move NSolidHeapSnapshot into EnvList (Santiago Gimeno) [nodesource/nsolid#102](https://github.com/nodesource/nsolid/pull/102)
* \[[`a8bae048ec`](https://github.com/nodesource/nsolid/commit/a8bae048ec)] - **src**: trim nsolid\_heap\_snapshot headers (Santiago Gimeno) [nodesource/nsolid#102](https://github.com/nodesource/nsolid/pull/102)
* \[[`c159ab3db9`](https://github.com/nodesource/nsolid/commit/c159ab3db9)] - **lib**: add nsolid JS API for heap profiling (Santiago Gimeno) [nodesource/nsolid#101](https://github.com/nodesource/nsolid/pull/101)
* \[[`6f33a5779e`](https://github.com/nodesource/nsolid/commit/6f33a5779e)] - **deps**: fix leak in Snapshot serialization (Santiago Gimeno) [nodesource/nsolid#91](https://github.com/nodesource/nsolid/pull/91)
* \[[`4ddd39c542`](https://github.com/nodesource/nsolid/commit/4ddd39c542)] - **agents,test**: support heap profiling in ZmqAgent (Santiago Gimeno) [nodesource/nsolid#91](https://github.com/nodesource/nsolid/pull/91)
* \[[`84ca0f8e96`](https://github.com/nodesource/nsolid/commit/84ca0f8e96)] - **src,test**: multiple fixes in heap profile code (Santiago Gimeno) [nodesource/nsolid#92](https://github.com/nodesource/nsolid/pull/92)
* \[[`2e1829326c`](https://github.com/nodesource/nsolid/commit/2e1829326c)] - **src**: include sync stop for heap object tracking (Juan José Arboleda) [nodesource/nsolid#92](https://github.com/nodesource/nsolid/pull/92)
* \[[`e2dcf4c196`](https://github.com/nodesource/nsolid/commit/e2dcf4c196)] - **agents**: better StatsDAgent binding string handling (Santiago Gimeno) [nodesource/nsolid#100](https://github.com/nodesource/nsolid/pull/100)
* \[[`372325c0bb`](https://github.com/nodesource/nsolid/commit/372325c0bb)] - **agents**: use nsuv weak\_ptr API's in StatsDAgent (Santiago Gimeno) [nodesource/nsolid#100](https://github.com/nodesource/nsolid/pull/100)
* \[[`4ca9f35175`](https://github.com/nodesource/nsolid/commit/4ca9f35175)] - **deps**: nsuv update to 486821a (Santiago Gimeno) [nodesource/nsolid#100](https://github.com/nodesource/nsolid/pull/100)
* \[[`a561a0a795`](https://github.com/nodesource/nsolid/commit/a561a0a795)] - **tools**: don't build doc upload artifacts (Trevor Norris) [nodesource/nsolid#97](https://github.com/nodesource/nsolid/pull/97)
* \[[`fe8c0f4555`](https://github.com/nodesource/nsolid/commit/fe8c0f4555)] - **agents**: clear env\_metrics\_map\_ on destruction (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`cc793a0c2f`](https://github.com/nodesource/nsolid/commit/cc793a0c2f)] - **agents,test**: add StatsDAgent tests (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`8341d848e0`](https://github.com/nodesource/nsolid/commit/8341d848e0)] - **agents**: fix exit condition on status\_command\_cb\_ (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`80c604f844`](https://github.com/nodesource/nsolid/commit/80c604f844)] - **agents**: reset addr\_index\_ on connector setup (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`e1f6c86625`](https://github.com/nodesource/nsolid/commit/e1f6c86625)] - **agents**: stop the agent only if last config fails (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`12353c15a4`](https://github.com/nodesource/nsolid/commit/12353c15a4)] - **agents**: synchronize status in StatsDagent::do\_stop (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`61f5acc70c`](https://github.com/nodesource/nsolid/commit/61f5acc70c)] - **agents**: move to Initializing before setting Hooks (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`35a3a9cf5d`](https://github.com/nodesource/nsolid/commit/35a3a9cf5d)] - **agents**: fix Status binding (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`f9f5ab0e44`](https://github.com/nodesource/nsolid/commit/f9f5ab0e44)] - **agents**: fix StatsDTcp destruction (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`be2b3019c9`](https://github.com/nodesource/nsolid/commit/be2b3019c9)] - **src**: don't start StatsD agent if statsd is null (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`5f32ba233a`](https://github.com/nodesource/nsolid/commit/5f32ba233a)] - **agents**: refactor profiling on ZmqAgent (Santiago Gimeno) [nodesource/nsolid#90](https://github.com/nodesource/nsolid/pull/90)
* \[[`91da66e120`](https://github.com/nodesource/nsolid/commit/91da66e120)] - **lint**: use const& in push() (Trevor Norris) [nodesource/nsolid#86](https://github.com/nodesource/nsolid/pull/86)
* \[[`44ca55fcc4`](https://github.com/nodesource/nsolid/commit/44ca55fcc4)] - **src**: make ProcessMetrics API thread-safe (Trevor Norris) [nodesource/nsolid#86](https://github.com/nodesource/nsolid/pull/86)
* \[[`6c6da98587`](https://github.com/nodesource/nsolid/commit/6c6da98587)] - **src**: fix crash @ NSolidHeapSnapshot::take\_snapshot (Santiago Gimeno) [nodesource/nsolid#89](https://github.com/nodesource/nsolid/pull/89)
* \[[`db17c3345c`](https://github.com/nodesource/nsolid/commit/db17c3345c)] - **src**: avoid double free of QCbTimeoutStor (Santiago Gimeno) [nodesource/nsolid#88](https://github.com/nodesource/nsolid/pull/88)
* \[[`4f812b58cb`](https://github.com/nodesource/nsolid/commit/4f812b58cb)] - **nsolid**: add start/stopTrackingHeapObjects APIs (Juan José Arboleda) [nodesource/nsolid#48](https://github.com/nodesource/nsolid/pull/48)
* \[[`d86090acec`](https://github.com/nodesource/nsolid/commit/d86090acec)] - **tools**: remove Report JS and format-cpp (Trevor Norris) [nodesource/nsolid#85](https://github.com/nodesource/nsolid/pull/85)
* \[[`0f22faa557`](https://github.com/nodesource/nsolid/commit/0f22faa557)] - **agents**: implement data handle ring buffer (Santiago Gimeno) [nodesource/nsolid#69](https://github.com/nodesource/nsolid/pull/69)
* \[[`2e682a2857`](https://github.com/nodesource/nsolid/commit/2e682a2857)] - **lib**: fix nsolid.app calculation (Santiago Gimeno) [nodesource/nsolid#81](https://github.com/nodesource/nsolid/pull/81)
* \[[`d85f073a27`](https://github.com/nodesource/nsolid/commit/d85f073a27)] - **agents**: add zmq bulk channel logs (Santiago Gimeno) [nodesource/nsolid#68](https://github.com/nodesource/nsolid/pull/68)
* \[[`462c9436be`](https://github.com/nodesource/nsolid/commit/462c9436be)] - **test**: add SaaS support to zmq agent tests (Santiago Gimeno) [nodesource/nsolid#66](https://github.com/nodesource/nsolid/pull/66)
* \[[`479e5b7dcb`](https://github.com/nodesource/nsolid/commit/479e5b7dcb)] - **doc**: fix markdown linter for release changelogs (Juan José Arboleda) [nodesource/nsolid#47](https://github.com/nodesource/nsolid/pull/47)
* \[[`c51e783a3f`](https://github.com/nodesource/nsolid/commit/c51e783a3f)] - **test**: add OTLP agent tests for tracing (Santiago Gimeno) [nodesource/nsolid#79](https://github.com/nodesource/nsolid/pull/79)
* \[[`18503414e9`](https://github.com/nodesource/nsolid/commit/18503414e9)] - **build,win**: add test-agents-prereqs target (Santiago Gimeno) [nodesource/nsolid#78](https://github.com/nodesource/nsolid/pull/78)
* \[[`0546cf693e`](https://github.com/nodesource/nsolid/commit/0546cf693e)] - **src,test**: refactor addon tests (Santiago Gimeno) [nodesource/nsolid#78](https://github.com/nodesource/nsolid/pull/78)
* \[[`15bb0c524e`](https://github.com/nodesource/nsolid/commit/15bb0c524e)] - **src**: export nsolid.h static functions (Santiago Gimeno) [nodesource/nsolid#78](https://github.com/nodesource/nsolid/pull/78)
* \[[`0d76bd2499`](https://github.com/nodesource/nsolid/commit/0d76bd2499)] - **agents**: fix race conditions on StatsDAgent (Santiago Gimeno) [nodesource/nsolid#78](https://github.com/nodesource/nsolid/pull/78)
* \[[`a6a08b77bc`](https://github.com/nodesource/nsolid/commit/a6a08b77bc)] - **agents**: fix OTLP agent deadlock on stop (Santiago Gimeno) [nodesource/nsolid#78](https://github.com/nodesource/nsolid/pull/78)
* \[[`f957f545d3`](https://github.com/nodesource/nsolid/commit/f957f545d3)] - **test**: fix linting issues (Santiago Gimeno) [nodesource/nsolid#70](https://github.com/nodesource/nsolid/pull/70)
* \[[`7a99c76192`](https://github.com/nodesource/nsolid/commit/7a99c76192)] - **agents**: fix in-progress profile on exit (Santiago Gimeno) [nodesource/nsolid#67](https://github.com/nodesource/nsolid/pull/67)
* \[[`5198cac081`](https://github.com/nodesource/nsolid/commit/5198cac081)] - **test**: fix test-zmq-startup-times (Santiago Gimeno) [nodesource/nsolid#84](https://github.com/nodesource/nsolid/pull/84)

## 2024-02-14, Version 5.0.5 'Hydrogen'

### Commits

* \[[`a3f1b383c5`](https://github.com/nodesource/nsolid/commit/a3f1b383c5)] - Merge tag 'v18.19.1' into node-v18.19.1-nsolid-v5.0.5-release (Trevor Norris)

## 2024-10-24, Version 5.0.4 'Hydrogen'

### Commits

* \[[`e9006c5d90`](https://github.com/nodesource/nsolid/commit/e9006c5d90)] - **agents**: all string metrics in zmq must be escaped (Santiago Gimeno) [nodesource/nsolid#65](https://github.com/nodesource/nsolid/pull/65)
* \[[`b4464e3827`](https://github.com/nodesource/nsolid/commit/b4464e3827)] - **test**: initial batch of zmq agent tests (Santiago Gimeno) [nodesource/nsolid#58](https://github.com/nodesource/nsolid/pull/58)

## 2024-01-09, Version 5.0.3 'Hydrogen'

### Commits

* \[[`097073a3a4`](https://github.com/nodesource/nsolid/commit/097073a3a4)] - **lib**: scan for scoped packages (Trevor Norris) [nodesource/nsolid#62](https://github.com/nodesource/nsolid/pull/62)
* \[[`369a84a70e`](https://github.com/nodesource/nsolid/commit/369a84a70e)] - **deps**: escape strings in v8::CpuProfile::Serialize (Santiago Gimeno) [nodesource/nsolid#60](https://github.com/nodesource/nsolid/pull/60)
* \[[`eb91535734`](https://github.com/nodesource/nsolid/commit/eb91535734)] - **agents**: apply the correct config on zmq with SaaS (Santiago Gimeno) [nodesource/nsolid#59](https://github.com/nodesource/nsolid/pull/59)

## 2023-12-21, Version 5.0.2 'Hydrogen'

### Commits

* \[[`ef78d06fc7`](https://github.com/nodesource/nsolid/commit/ef78d06fc7)] - **src**: fix FastPushSpanDataUint64 (Santiago Gimeno) [nodesource/nsolid#49](https://github.com/nodesource/nsolid/pull/49)
* \[[`7486d48441`](https://github.com/nodesource/nsolid/commit/7486d48441)] - **src**: make nsolid::ThreadMetrics safer (Santiago Gimeno) [nodesource/nsolid#37](https://github.com/nodesource/nsolid/pull/37)
* \[[`9b60b164cf`](https://github.com/nodesource/nsolid/commit/9b60b164cf)] - **src**: improve nsolid::CustomCommand() (Santiago Gimeno) [nodesource/nsolid#44](https://github.com/nodesource/nsolid/pull/44)
* \[[`a340c360de`](https://github.com/nodesource/nsolid/commit/a340c360de)] - **agents**: fix exit message format (Santiago Gimeno) [nodesource/nsolid#45](https://github.com/nodesource/nsolid/pull/45)
* \[[`b631e1240d`](https://github.com/nodesource/nsolid/commit/b631e1240d)] - **src**: guard nsolid headers with NODE\_WANT\_INTERNALS (Santiago Gimeno) [nodesource/nsolid#43](https://github.com/nodesource/nsolid/pull/43)
* \[[`c77d28efaf`](https://github.com/nodesource/nsolid/commit/c77d28efaf)] - **src**: add fast api for some push methods (Santiago Gimeno) [nodesource/nsolid#19](https://github.com/nodesource/nsolid/pull/19)
* \[[`8a1fd89490`](https://github.com/nodesource/nsolid/commit/8a1fd89490)] - **agents**: use main\_thread\_id instead of 0 (Santiago Gimeno) [nodesource/nsolid#21](https://github.com/nodesource/nsolid/pull/21)
* \[[`8ea74d5752`](https://github.com/nodesource/nsolid/commit/8ea74d5752)] - **deps**: update libzmq to 4.3.5 (Santiago Gimeno) [nodesource/nsolid#28](https://github.com/nodesource/nsolid/pull/28)

## 2023-12-07, Version 5.0.1 'Hydrogen'

### Commits

* \[[`4576d9acbf`](https://github.com/nodesource/nsolid/commit/4576d9acbf)] - **src**: NODE\_RELEASE should be node (Santiago Gimeno) [#36](https://github.com/nodesource/nsolid/pull/36)
* \[[`55a2d6cf08`](https://github.com/nodesource/nsolid/commit/55a2d6cf08)] - **agents**: fix crash in HttpCurlGlobalInitializer (Santiago Gimeno) [#34](https://github.com/nodesource/nsolid/pull/34)
* \[[`dfe9838d37`](https://github.com/nodesource/nsolid/commit/dfe9838d37)] - **agents**: fix crash in StatsDAgent (Santiago Gimeno) [#32](https://github.com/nodesource/nsolid/pull/32)
* \[[`6c6d4cb8a6`](https://github.com/nodesource/nsolid/commit/6c6d4cb8a6)] - **agents**: fix OTLPAgent race conditions on cleanup (Santiago Gimeno) [#30](https://github.com/nodesource/nsolid/pull/30)
* \[[`37270971bb`](https://github.com/nodesource/nsolid/commit/37270971bb)] - **src**: change name from scarab (Trevor Norris)
* \[[`81a55f5541`](https://github.com/nodesource/nsolid/commit/81a55f5541)] - **src**: migrate cpu profile changes from iron (Trevor Norris)
* \[[`846637d211`](https://github.com/nodesource/nsolid/commit/846637d211)] - **src**: fix SetupArrayBufferExports() declaration (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`2dbb8269ab`](https://github.com/nodesource/nsolid/commit/2dbb8269ab)] - **src**: cleanup the RunCommand queues on RemoveEnv (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`5ab8629387`](https://github.com/nodesource/nsolid/commit/5ab8629387)] - **src**: fix EnvInst::GetCurrent() (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`2d187ff46c`](https://github.com/nodesource/nsolid/commit/2d187ff46c)] - **src**: change EnvList::promise\_tracking\_() signature (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`797d115e96`](https://github.com/nodesource/nsolid/commit/797d115e96)] - **src**: fix NODE\_RELEASE\_URLBASE (Santiago Gimeno) [#27](https://github.com/nodesource/nsolid/pull/27)
* \[[`4c9e5171ec`](https://github.com/nodesource/nsolid/commit/4c9e5171ec)] - **src**: clear envinst\_ after env (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`fd37d37f9d`](https://github.com/nodesource/nsolid/commit/fd37d37f9d)] - **src**: use own RequestInterrupt implementation (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`62b4e6c716`](https://github.com/nodesource/nsolid/commit/62b4e6c716)] - **src**: reset main\_thread\_id\_ when it is removed (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`150b53af0c`](https://github.com/nodesource/nsolid/commit/150b53af0c)] - **src**: make main\_thread\_id\_ atomic (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`6a61cff4a9`](https://github.com/nodesource/nsolid/commit/6a61cff4a9)] - **agents**: fix profile/snapshot messages body format (Santiago Gimeno) [#23](https://github.com/nodesource/nsolid/pull/23)
* \[[`40931c47c2`](https://github.com/nodesource/nsolid/commit/40931c47c2)] - **src**: move CpuProfilerStor impl to cc file (Santiago Gimeno) [#18](https://github.com/nodesource/nsolid/pull/18)
* \[[`ac7b0a0dae`](https://github.com/nodesource/nsolid/commit/ac7b0a0dae)] - **src**: handle bad allocation errors (Santiago Gimeno) [#20](https://github.com/nodesource/nsolid/pull/20)
* \[[`b5bf6e32b8`](https://github.com/nodesource/nsolid/commit/b5bf6e32b8)] - **agents**: fixup log in ZmqAgent (Santiago Gimeno) [#22](https://github.com/nodesource/nsolid/pull/22)
* \[[`f4303aaf2d`](https://github.com/nodesource/nsolid/commit/f4303aaf2d)] - **agents**: remove ASSERT that can be ignored (Trevor Norris) [#13](https://github.com/nodesource/nsolid/pull/13)
* \[[`f18c40ba0e`](https://github.com/nodesource/nsolid/commit/f18c40ba0e)] - **src**: don't allow parallel calls to Update() (Trevor Norris) [#13](https://github.com/nodesource/nsolid/pull/13)
