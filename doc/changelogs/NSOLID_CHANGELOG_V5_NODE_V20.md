# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2024-10-04, Version 20.18.0-nsolid-v5.3.4 'Iron'

### Commits

* \[[`444ff7e543`](https://github.com/nodesource/nsolid/commit/444ff7e543)] - Merge branch 'node-v20.18.0-nsolid-v5.3.4-release' into node-v20.x-nsolid-v5.x (Trevor Norris) [nodesource/nsolid#189](https://github.com/nodesource/nsolid/pull/189)
* \[[`70b12188c2`](https://github.com/nodesource/nsolid/commit/70b12188c2)] - **build:** enable commit-queue (RafaelGSS) [nodesource/nsolid#187](https://github.com/nodesource/nsolid/pull/187)
* \[[`487077afb1`](https://github.com/nodesource/nsolid/commit/487077afb1)] - **doc:** add different readme to landing section (RafaelGSS) [nodesource/nsolid#188](https://github.com/nodesource/nsolid/pull/188)
* \[[`ba378efe3e`](https://github.com/nodesource/nsolid/commit/ba378efe3e)] - **doc:** include landing PR section (RafaelGSS) [nodesource/nsolid#188](https://github.com/nodesource/nsolid/pull/188)
* \[[`d1095b64f6`](https://github.com/nodesource/nsolid/commit/d1095b64f6)] - **doc:** add project members (RafaelGSS) [nodesource/nsolid#188](https://github.com/nodesource/nsolid/pull/188)
* \[[`0db40b4b08`](https://github.com/nodesource/nsolid/commit/0db40b4b08)] - **src:** add protobuf to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`6d1e57e3cc`](https://github.com/nodesource/nsolid/commit/6d1e57e3cc)] - **src:** add libsodium to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`c8fe605aa6`](https://github.com/nodesource/nsolid/commit/c8fe605aa6)] - **src:** add grpc to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`8d031ae822`](https://github.com/nodesource/nsolid/commit/8d031ae822)] - **src:** add zmq to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`eb977511c0`](https://github.com/nodesource/nsolid/commit/eb977511c0)] - **src:** add opentelemetry to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`0fb77a69e4`](https://github.com/nodesource/nsolid/commit/0fb77a69e4)] - **src:** add nlohmann to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`b2fbaa937d`](https://github.com/nodesource/nsolid/commit/b2fbaa937d)] - **src:** add curl to process.versions (RafaelGSS) [nodesource/nsolid#166](https://github.com/nodesource/nsolid/pull/166)
* \[[`cfd306f80c`](https://github.com/nodesource/nsolid/commit/cfd306f80c)] - **agents:** use OTLP Summary for percentile metrics (Santiago Gimeno) [nodesource/nsolid#180](https://github.com/nodesource/nsolid/pull/180)
* \[[`a0b1795115`](https://github.com/nodesource/nsolid/commit/a0b1795115)] - **deps:** add support for exporting Summary via OTLP (Santiago Gimeno) [nodesource/nsolid#180](https://github.com/nodesource/nsolid/pull/180)
* \[[`13e695f334`](https://github.com/nodesource/nsolid/commit/13e695f334)] - **lib:** check min value for sampleInterval and duration (RafaelGSS) [nodesource/nsolid#173](https://github.com/nodesource/nsolid/pull/173)
* \[[`3117f05892`](https://github.com/nodesource/nsolid/commit/3117f05892)] - **build:** disable get-released-versions for nsolid (RafaelGSS) [nodesource/nsolid#174](https://github.com/nodesource/nsolid/pull/174)
* \[[`5a48a4ef6a`](https://github.com/nodesource/nsolid/commit/5a48a4ef6a)] - **build:** fix lint-sh (RafaelGSS) [nodesource/nsolid#176](https://github.com/nodesource/nsolid/pull/176)
* \[[`3913f0e27f`](https://github.com/nodesource/nsolid/commit/3913f0e27f)] - **agents:** refactor ZmqAgent to use ProfileCollector (Santiago Gimeno) [nodesource/nsolid#161](https://github.com/nodesource/nsolid/pull/161)
* \[[`183b115e48`](https://github.com/nodesource/nsolid/commit/183b115e48)] - **agents:** implement ProfileCollector class (Santiago Gimeno) [nodesource/nsolid#161](https://github.com/nodesource/nsolid/pull/161)


## 2024-08-23, Version 20.17.0-nsolid-v5.3.3 'Iron'

### Commits

* \[[`a60cc53ec1`](https://github.com/nodesource/nsolid/commit/a60cc53ec1)] - **src:** fix heapSampling crash if sampleInterval is 0 (Santiago Gimeno) [nodesource/nsolid#171](https://github.com/nodesource/nsolid/pull/171)
* \[[`19ae4c17a5`](https://github.com/nodesource/nsolid/commit/19ae4c17a5)] - Merge tag 'v20.17.0' into node-v20.17.0-nsolid-v5.3.3-release (Trevor Norris)
* \[[`3ea993c2e3`](https://github.com/nodesource/nsolid/commit/3ea993c2e3)] - **agents**: implement SpanCollector helper class (Santiago Gimeno) [nodesource/nsolid#160](https://github.com/nodesource/nsolid/pull/160)
* \[[`45f251344f`](https://github.com/nodesource/nsolid/commit/45f251344f)] - **agents**: preliminar changes to support logs in otlp (Santiago Gimeno) [nodesource/nsolid#152](https://github.com/nodesource/nsolid/pull/152)
* \[[`3e19163718`](https://github.com/nodesource/nsolid/commit/3e19163718)] - **test**: include missing \<algorithm> header (Santiago Gimeno) [nodesource/nsolid#159](https://github.com/nodesource/nsolid/pull/159)
* \[[`6ac07af10a`](https://github.com/nodesource/nsolid/commit/6ac07af10a)] - **deps**: update grpc to 1.65.2 (Santiago Gimeno) [nodesource/nsolid#159](https://github.com/nodesource/nsolid/pull/159)
* \[[`5e0f55d8b8`](https://github.com/nodesource/nsolid/commit/5e0f55d8b8)] - **tools**: add update-grpc updater (Santiago Gimeno) [nodesource/nsolid#159](https://github.com/nodesource/nsolid/pull/159)

## 2024-07-24, Version 20.16.0-nsolid-v5.3.2 'Iron'

### Commits

* \[[`a126f9a4ec`](https://github.com/nodesource/nsolid/commit/a126f9a4ec)] - Merge tag 'v20.16.0' into node-v20.16.0-nsolid-v5.3.2-release (Trevor Norris)
* \[[`5da27a264d`](https://github.com/nodesource/nsolid/commit/5da27a264d)] - **src**: initialize prev\_idle\_time\_ on ThreadMetrics (Santiago Gimeno) [nodesource/nsolid#156](https://github.com/nodesource/nsolid/pull/156)

## 2024-07-08, Version 20.15.1-nsolid-v5.3.1 'Iron'

### Commits

* \[[`9d83482cae`](https://github.com/nodesource/nsolid/commit/9d83482cae)] - Merge tag 'v20.15.1' into node-v20.15.1-nsolid-v5.3.1-release (Trevor Norris)

## 2024-06-24, Version 20.15.0-nsolid-v5.3.0 'Iron'

### Commits

* \[[`77fcac9e15`](https://github.com/nodesource/nsolid/commit/77fcac9e15)] - **doc**: fix 20.14.0-nsolid-v5.2.3 changelog (Santiago Gimeno)
* \[[`4af9fcff83`](https://github.com/nodesource/nsolid/commit/4af9fcff83)] - **doc**: fix lint error (Trevor Norris)
* \[[`e63c49b50e`](https://github.com/nodesource/nsolid/commit/e63c49b50e)] - Merge tag 'v20.15.0' into node-v20.15.0-nsolid-v5.3.0-release (Trevor Norris)
* \[[`c6e2cd42da`](https://github.com/nodesource/nsolid/commit/c6e2cd42da)] - **test**: fix flaky test when run under load (Trevor Norris) [nodesource/nsolid#144](https://github.com/nodesource/nsolid/pull/144)
* \[[`a184544cf1`](https://github.com/nodesource/nsolid/commit/a184544cf1)] - **test**: fix flaky test-otlp-metrics.mjs (Santiago Gimeno) [nodesource/nsolid#143](https://github.com/nodesource/nsolid/pull/143)
* \[[`418669b334`](https://github.com/nodesource/nsolid/commit/418669b334)] - **agents**: get telemetry data even if no cmd handle (Santiago Gimeno) [nodesource/nsolid#140](https://github.com/nodesource/nsolid/pull/140)
* \[[`1fb0168dc4`](https://github.com/nodesource/nsolid/commit/1fb0168dc4)] - **agents**: allow using OTLP env variable in OTLPAgent (Santiago Gimeno) [nodesource/nsolid#138](https://github.com/nodesource/nsolid/pull/138)
* \[[`babc9711f2`](https://github.com/nodesource/nsolid/commit/babc9711f2)] - **meta**: lint fixes (Trevor Norris) [nodesource/nsolid#139](https://github.com/nodesource/nsolid/pull/139)
* \[[`9c79696ac0`](https://github.com/nodesource/nsolid/commit/9c79696ac0)] - **src**: add log native and JS APIs (Trevor Norris)
* \[[`9b03aaad75`](https://github.com/nodesource/nsolid/commit/9b03aaad75)] - **agents**: add metrics transform API to agent (Trevor Norris) [nodesource/nsolid#123](https://github.com/nodesource/nsolid/pull/123)
* \[[`deb325c863`](https://github.com/nodesource/nsolid/commit/deb325c863)] - **agents**: remove start/stop from JS API (Trevor Norris) [nodesource/nsolid#123](https://github.com/nodesource/nsolid/pull/123)
* \[[`9533effafe`](https://github.com/nodesource/nsolid/commit/9533effafe)] - **src**: add GetAllEnvInst API (Trevor Norris) [nodesource/nsolid#123](https://github.com/nodesource/nsolid/pull/123)

## 2024-05-28, Version 20.14.0-nsolid-v5.2.3 'Iron'

### Commits

* \[[`bda292a068`](https://github.com/nodesource/nsolid/commit/bda292a068)] - Merge tag 'v20.14.0' (Trevor Norris)
* \[[`e31b66b4ea`](https://github.com/nodesource/nsolid/commit/e31b66b4ea)] - **deps**: add grpc\@1.52.0 (Santiago Gimeno) [nodesource/nsolid#133](https://github.com/nodesource/nsolid/pull/133)
* \[[`df3e8ac5d8`](https://github.com/nodesource/nsolid/commit/df3e8ac5d8)] - **deps**: update opentelemetry-cpp to 1.15.0 (Santiago Gimeno) [nodesource/nsolid#133](https://github.com/nodesource/nsolid/pull/133)
* \[[`438391b7ba`](https://github.com/nodesource/nsolid/commit/438391b7ba)] - **agents**: add initial gRPC support in OTLPAgent (Santiago Gimeno) [nodesource/nsolid#133](https://github.com/nodesource/nsolid/pull/133)
* \[[`c2e60c6752`](https://github.com/nodesource/nsolid/commit/c2e60c6752)] - **agents**: enable gRPC support in OTLPAgent (Santiago Gimeno) [nodesource/nsolid#134](https://github.com/nodesource/nsolid/pull/134)

## 2024-05-21, Version 20.13.1-nsolid-v5.2.2 'Iron'

## 2024-05-09, Version 20.13.0-nsolid-v5.2.1 'Iron'

### Commits

* \[[`6f0974c684`](https://github.com/nodesource/nsolid/commit/6f0974c684)] - Merge tag 'v20.13.1' (Trevor Norris)
* \[[`3f022bd43c`](https://github.com/nodesource/nsolid/commit/3f022bd43c)] - Merge tag 'v20.13.0' (Trevor Norris)
* \[[`91dcac7bac`](https://github.com/nodesource/nsolid/commit/91dcac7bac)] - **agents**: set state when writing (Trevor Norris) [nodesource/nsolid#122](https://github.com/nodesource/nsolid/pull/122)
* \[[`c667ebf576`](https://github.com/nodesource/nsolid/commit/c667ebf576)] - **tools**: add agents path to workflow (Trevor Norris) [nodesource/nsolid#122](https://github.com/nodesource/nsolid/pull/122)
* \[[`509a1d5372`](https://github.com/nodesource/nsolid/commit/509a1d5372)] - **agents**: make tcp/udp inherit from virtual class (Trevor Norris) [nodesource/nsolid#122](https://github.com/nodesource/nsolid/pull/122)
* \[[`150bd4a9c4`](https://github.com/nodesource/nsolid/commit/150bd4a9c4)] - **agents**: remove Disconnected (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)
* \[[`06e5bd77f9`](https://github.com/nodesource/nsolid/commit/06e5bd77f9)] - **agents**: have tcp/udp retry in statsd (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)
* \[[`b30a1966f7`](https://github.com/nodesource/nsolid/commit/b30a1966f7)] - **agents**: only create on correct protocol (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)
* \[[`6c4162ddae`](https://github.com/nodesource/nsolid/commit/6c4162ddae)] - **agents**: remove need for loop on create() (Trevor Norris) [nodesource/nsolid#121](https://github.com/nodesource/nsolid/pull/121)

## 2024-04-29, Version 20.12.2-nsolid-v5.2.0 'Iron'

### Commits

* \[[`78e6453747`](https://github.com/nodesource/nsolid/commit/78e6453747)] - **src**: fix the base case in the heap profiler JSON generation (Juan José Arboleda) [nodesource/nsolid#125](https://github.com/nodesource/nsolid/pull/125)

## 2024-04-10, Version 20.12.2-nsolid-v5.1.2 'Iron'

### Commits

* \[[`ea4b14d82b`](https://github.com/nodesource/nsolid/commit/ea4b14d82b)] - Merge tag 'v20.12.2' (Trevor Norris)

## 2024-04-03, Version 20.12.1-nsolid-v5.1.1 'Iron'

### Commits

* \[[`f71ed43b3f`](https://github.com/nodesource/nsolid/commit/f71ed43b3f)] - Merge tag 'v20.12.1' (Juan Arboleda)

## 2024-03-27, Version 20.12.0-nsolid-v5.1.0 'Iron'

### Commits

* \[[`e6024de2bf`](https://github.com/nodesource/nsolid/commit/e6024de2bf)] - Merge tag 'v20.12.0' (Trevor Norris)
* \[[`e32fecb3b0`](https://github.com/nodesource/nsolid/commit/e32fecb3b0)] - **deps**: update opentelemetry-cpp to 1.14.2 (Santiago Gimeno) [nodesource/nsolid#109](https://github.com/nodesource/nsolid/pull/109)
* \[[`8e9bcac49e`](https://github.com/nodesource/nsolid/commit/8e9bcac49e)] - **tools**: fix opentelemetry-cpp updater (Santiago Gimeno) [nodesource/nsolid#109](https://github.com/nodesource/nsolid/pull/109)
* \[[`71973239a6`](https://github.com/nodesource/nsolid/commit/71973239a6)] - **agents**: fix agent reconnect handshake on ZmqAgent (Santiago Gimeno) [nodesource/nsolid#105](https://github.com/nodesource/nsolid/pull/105)
* \[[`9814c94726`](https://github.com/nodesource/nsolid/commit/9814c94726)] - **test**: fix flaky nsolid-tracing test (Santiago Gimeno) [nodesource/nsolid#104](https://github.com/nodesource/nsolid/pull/104)
* \[[`378ac739e1`](https://github.com/nodesource/nsolid/commit/378ac739e1)] - **src**: move NSolidHeapSnapshot into EnvList (Santiago Gimeno) [nodesource/nsolid#102](https://github.com/nodesource/nsolid/pull/102)
* \[[`7f664c0c8c`](https://github.com/nodesource/nsolid/commit/7f664c0c8c)] - **src**: trim nsolid\_heap\_snapshot headers (Santiago Gimeno) [nodesource/nsolid#102](https://github.com/nodesource/nsolid/pull/102)
* \[[`6ece144c48`](https://github.com/nodesource/nsolid/commit/6ece144c48)] - **lib**: add nsolid JS API for heap profiling (Santiago Gimeno) [nodesource/nsolid#101](https://github.com/nodesource/nsolid/pull/101)
* \[[`d3cb4be322`](https://github.com/nodesource/nsolid/commit/d3cb4be322)] - **deps**: fix leak in Snapshot serialization (Santiago Gimeno) [nodesource/nsolid#91](https://github.com/nodesource/nsolid/pull/91)
* \[[`e9f2a65842`](https://github.com/nodesource/nsolid/commit/e9f2a65842)] - **agents,test**: support heap profiling in ZmqAgent (Santiago Gimeno) [nodesource/nsolid#91](https://github.com/nodesource/nsolid/pull/91)
* \[[`d38371144e`](https://github.com/nodesource/nsolid/commit/d38371144e)] - **src,test**: multiple fixes in heap profile code (Santiago Gimeno) [nodesource/nsolid#92](https://github.com/nodesource/nsolid/pull/92)
* \[[`78f5ecad84`](https://github.com/nodesource/nsolid/commit/78f5ecad84)] - **src**: include sync stop for heap object tracking (Juan José Arboleda) [nodesource/nsolid#92](https://github.com/nodesource/nsolid/pull/92)
* \[[`c8fdade359`](https://github.com/nodesource/nsolid/commit/c8fdade359)] - **agents**: better StatsDAgent binding string handling (Santiago Gimeno) [nodesource/nsolid#100](https://github.com/nodesource/nsolid/pull/100)
* \[[`395d94d3a6`](https://github.com/nodesource/nsolid/commit/395d94d3a6)] - **agents**: use nsuv weak\_ptr API's in StatsDAgent (Santiago Gimeno) [nodesource/nsolid#100](https://github.com/nodesource/nsolid/pull/100)
* \[[`0b3347e54e`](https://github.com/nodesource/nsolid/commit/0b3347e54e)] - **deps**: nsuv update to 486821a (Santiago Gimeno) [nodesource/nsolid#100](https://github.com/nodesource/nsolid/pull/100)
* \[[`2d2b8cec36`](https://github.com/nodesource/nsolid/commit/2d2b8cec36)] - **tools**: don't build doc upload artifacts (Trevor Norris) [nodesource/nsolid#97](https://github.com/nodesource/nsolid/pull/97)
* \[[`0529a47688`](https://github.com/nodesource/nsolid/commit/0529a47688)] - **agents**: clear env\_metrics\_map\_ on destruction (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`9e3fb9275b`](https://github.com/nodesource/nsolid/commit/9e3fb9275b)] - **agents,test**: add StatsDAgent tests (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`17192ffc8e`](https://github.com/nodesource/nsolid/commit/17192ffc8e)] - **agents**: fix exit condition on status\_command\_cb\_ (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`3b0df1529a`](https://github.com/nodesource/nsolid/commit/3b0df1529a)] - **agents**: reset addr\_index\_ on connector setup (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`bb67444bcf`](https://github.com/nodesource/nsolid/commit/bb67444bcf)] - **agents**: stop the agent only if last config fails (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`e5efe5d69f`](https://github.com/nodesource/nsolid/commit/e5efe5d69f)] - **agents**: synchronize status in StatsDagent::do\_stop (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`e97baf7c3c`](https://github.com/nodesource/nsolid/commit/e97baf7c3c)] - **agents**: move to Initializing before setting Hooks (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`2b5c0da4a1`](https://github.com/nodesource/nsolid/commit/2b5c0da4a1)] - **agents**: fix Status binding (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`6bff219f79`](https://github.com/nodesource/nsolid/commit/6bff219f79)] - **agents**: fix StatsDTcp destruction (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`9f81e041a8`](https://github.com/nodesource/nsolid/commit/9f81e041a8)] - **src**: don't start StatsD agent if statsd is null (Santiago Gimeno) [nodesource/nsolid#87](https://github.com/nodesource/nsolid/pull/87)
* \[[`5dd46b27f8`](https://github.com/nodesource/nsolid/commit/5dd46b27f8)] - **agents**: refactor profiling on ZmqAgent (Santiago Gimeno) [nodesource/nsolid#90](https://github.com/nodesource/nsolid/pull/90)
* \[[`1bd9c6dc95`](https://github.com/nodesource/nsolid/commit/1bd9c6dc95)] - **lint**: use const& in push() (Trevor Norris) [nodesource/nsolid#86](https://github.com/nodesource/nsolid/pull/86)
* \[[`e2d708721e`](https://github.com/nodesource/nsolid/commit/e2d708721e)] - **src**: make ProcessMetrics API thread-safe (Trevor Norris) [nodesource/nsolid#86](https://github.com/nodesource/nsolid/pull/86)
* \[[`173d6baa17`](https://github.com/nodesource/nsolid/commit/173d6baa17)] - **src**: fix crash @ NSolidHeapSnapshot::take\_snapshot (Santiago Gimeno) [nodesource/nsolid#89](https://github.com/nodesource/nsolid/pull/89)
* \[[`f7e61f6603`](https://github.com/nodesource/nsolid/commit/f7e61f6603)] - **src**: avoid double free of QCbTimeoutStor (Santiago Gimeno) [nodesource/nsolid#88](https://github.com/nodesource/nsolid/pull/88)
* \[[`f7b4b61dac`](https://github.com/nodesource/nsolid/commit/f7b4b61dac)] - **nsolid**: add start/stopTrackingHeapObjects APIs (Juan José Arboleda) [nodesource/nsolid#48](https://github.com/nodesource/nsolid/pull/48)
* \[[`2b043c5b84`](https://github.com/nodesource/nsolid/commit/2b043c5b84)] - **tools**: remove Report JS and format-cpp (Trevor Norris) [nodesource/nsolid#85](https://github.com/nodesource/nsolid/pull/85)
* \[[`ebd3f8cb9a`](https://github.com/nodesource/nsolid/commit/ebd3f8cb9a)] - **agents**: implement data handle ring buffer (Santiago Gimeno) [nodesource/nsolid#69](https://github.com/nodesource/nsolid/pull/69)
* \[[`b78755bb77`](https://github.com/nodesource/nsolid/commit/b78755bb77)] - **lib**: fix nsolid.app calculation (Santiago Gimeno) [nodesource/nsolid#81](https://github.com/nodesource/nsolid/pull/81)
* \[[`03a390a535`](https://github.com/nodesource/nsolid/commit/03a390a535)] - **agents**: add zmq bulk channel logs (Santiago Gimeno) [nodesource/nsolid#68](https://github.com/nodesource/nsolid/pull/68)

## 2024-02-14, Version 20.11.1-nsolid-v5.0.5 'Iron'

### Commits

* \[[`61e88a12f0`](https://github.com/nodesource/nsolid/commit/61e88a12f0)] - Merge tag 'v20.11.1' into node-v20.11.1-nsolid-v5.0.5-release (Trevor Norris)

## 2024-01-24, Version 20.11.0-nsolid-v5.0.4 'Iron'

### Commits

* \[[`13c420ecf2`](https://github.com/nodesource/nsolid/commit/13c420ecf2)] - **agents**: all string metrics in zmq must be escaped (Santiago Gimeno) [nodesource/nsolid#65](https://github.com/nodesource/nsolid/pull/65)
* \[[`b56d2cb651`](https://github.com/nodesource/nsolid/commit/b56d2cb651)] - **test**: initial batch of zmq agent tests (Santiago Gimeno) [nodesource/nsolid#58](https://github.com/nodesource/nsolid/pull/58)

## 2024-01-09, Version 20.11.0-nsolid-v5.0.3 'Iron'

### Commits

* \[[`0cfd6845c4`](https://github.com/nodesource/nsolid/commit/0cfd6845c4)] - **lib**: scan for scoped packages (Trevor Norris) [nodesource/nsolid#62](https://github.com/nodesource/nsolid/pull/62)
* \[[`ccc7e9132e`](https://github.com/nodesource/nsolid/commit/ccc7e9132e)] - **deps**: escape strings in v8::CpuProfile::Serialize (Santiago Gimeno) [nodesource/nsolid#60](https://github.com/nodesource/nsolid/pull/60)
* \[[`4d144d99fc`](https://github.com/nodesource/nsolid/commit/4d144d99fc)] - **agents**: apply the correct config on zmq with SaaS (Santiago Gimeno) [nodesource/nsolid#59](https://github.com/nodesource/nsolid/pull/59)

## 2023-12-21, Version 20.10.0-nsolid-v5.0.2 'Iron'

### Commits

* \[[`50c9d55ef9`](https://github.com/nodesource/nsolid/commit/50c9d55ef9)] - 2023-12-21, N|Solid v5.0.2 Iron Release (Trevor Norris)
* \[[`ffdbc83643`](https://github.com/nodesource/nsolid/commit/ffdbc83643)] - **src**: fix FastPushSpanDataUint64 (Santiago Gimeno) [nodesource/nsolid#49](https://github.com/nodesource/nsolid/pull/49)
* \[[`a218600db1`](https://github.com/nodesource/nsolid/commit/a218600db1)] - **src**: make nsolid::ThreadMetrics safer (Santiago Gimeno) [nodesource/nsolid#37](https://github.com/nodesource/nsolid/pull/37)
* \[[`fccddd88c4`](https://github.com/nodesource/nsolid/commit/fccddd88c4)] - **src**: improve nsolid::CustomCommand() (Santiago Gimeno) [nodesource/nsolid#44](https://github.com/nodesource/nsolid/pull/44)
* \[[`c0ed8e749f`](https://github.com/nodesource/nsolid/commit/c0ed8e749f)] - **agents**: fix exit message format (Santiago Gimeno) [nodesource/nsolid#45](https://github.com/nodesource/nsolid/pull/45)
* \[[`367fe4c6d3`](https://github.com/nodesource/nsolid/commit/367fe4c6d3)] - **src**: guard nsolid headers with NODE\_WANT\_INTERNALS (Santiago Gimeno) [nodesource/nsolid#43](https://github.com/nodesource/nsolid/pull/43)
* \[[`5208abb3f7`](https://github.com/nodesource/nsolid/commit/5208abb3f7)] - **src**: add fast api for some push methods (Santiago Gimeno) [nodesource/nsolid#19](https://github.com/nodesource/nsolid/pull/19)
* \[[`b6bcb9de39`](https://github.com/nodesource/nsolid/commit/b6bcb9de39)] - **agents**: use main\_thread\_id instead of 0 (Santiago Gimeno) [nodesource/nsolid#21](https://github.com/nodesource/nsolid/pull/21)
* \[[`48fd60f72e`](https://github.com/nodesource/nsolid/commit/48fd60f72e)] - **deps**: update libzmq to 4.3.5 (Santiago Gimeno) [nodesource/nsolid#28](https://github.com/nodesource/nsolid/pull/28)

## 2023-12-07, Version 20.10.0-nsolid-v5.0.1 'Iron'

### Commits

* \[[`fea863d27e`](https://github.com/nodesource/nsolid/commit/fea863d27e)] - **lib**: fix lint issues (Trevor Norris)
* \[[`21459cb673`](https://github.com/nodesource/nsolid/commit/21459cb673)] - **src**: NODE\_RELEASE should be node (Santiago Gimeno) [#36](https://github.com/nodesource/nsolid/pull/36)
* \[[`9eb4d066f7`](https://github.com/nodesource/nsolid/commit/9eb4d066f7)] - **agents**: fix crash in HttpCurlGlobalInitializer (Santiago Gimeno) [#34](https://github.com/nodesource/nsolid/pull/34)
* \[[`5a47d7e128`](https://github.com/nodesource/nsolid/commit/5a47d7e128)] - **agents**: fix crash in StatsDAgent (Santiago Gimeno) [#32](https://github.com/nodesource/nsolid/pull/32)
* \[[`b2c1bb381f`](https://github.com/nodesource/nsolid/commit/b2c1bb381f)] - **agents**: fix OTLPAgent race conditions on cleanup (Santiago Gimeno) [#30](https://github.com/nodesource/nsolid/pull/30)
* \[[`f6fd580c25`](https://github.com/nodesource/nsolid/commit/f6fd580c25)] - **src**: fix SetupArrayBufferExports() declaration (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`ed78fc603a`](https://github.com/nodesource/nsolid/commit/ed78fc603a)] - **src**: cleanup the RunCommand queues on RemoveEnv (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`2e5526744d`](https://github.com/nodesource/nsolid/commit/2e5526744d)] - **src**: fix EnvInst::GetCurrent() (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`33c8b296b9`](https://github.com/nodesource/nsolid/commit/33c8b296b9)] - **src**: change EnvList::promise\_tracking\_() signature (Santiago Gimeno) [#25](https://github.com/nodesource/nsolid/pull/25)
* \[[`6eb5d34f6c`](https://github.com/nodesource/nsolid/commit/6eb5d34f6c)] - **src**: fix NODE\_RELEASE\_URLBASE (Santiago Gimeno) [#27](https://github.com/nodesource/nsolid/pull/27)
* \[[`3ec83cd8fd`](https://github.com/nodesource/nsolid/commit/3ec83cd8fd)] - **src**: clear envinst\_ after env (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`1dca94bfed`](https://github.com/nodesource/nsolid/commit/1dca94bfed)] - **src**: use own RequestInterrupt implementation (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`3ac8239878`](https://github.com/nodesource/nsolid/commit/3ac8239878)] - **src**: reset main\_thread\_id\_ when it is removed (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`d849d3fdc1`](https://github.com/nodesource/nsolid/commit/d849d3fdc1)] - **src**: make main\_thread\_id\_ atomic (Trevor Norris) [#24](https://github.com/nodesource/nsolid/pull/24)
* \[[`ffb241f9e2`](https://github.com/nodesource/nsolid/commit/ffb241f9e2)] - **agents**: fix profile/snapshot messages body format (Santiago Gimeno) [#23](https://github.com/nodesource/nsolid/pull/23)
* \[[`6e37c40044`](https://github.com/nodesource/nsolid/commit/6e37c40044)] - **src**: move CpuProfilerStor impl to cc file (Santiago Gimeno) [#18](https://github.com/nodesource/nsolid/pull/18)
* \[[`877b3a3dcd`](https://github.com/nodesource/nsolid/commit/877b3a3dcd)] - **src**: handle bad allocation errors (Santiago Gimeno) [#20](https://github.com/nodesource/nsolid/pull/20)
* \[[`a0a32ca005`](https://github.com/nodesource/nsolid/commit/a0a32ca005)] - **agents**: fixup log in ZmqAgent (Santiago Gimeno) [#22](https://github.com/nodesource/nsolid/pull/22)
* \[[`24bde1e8d7`](https://github.com/nodesource/nsolid/commit/24bde1e8d7)] - **agents**: remove ASSERT that can be ignored (Trevor Norris) [#13](https://github.com/nodesource/nsolid/pull/13)
* \[[`bced2edb52`](https://github.com/nodesource/nsolid/commit/bced2edb52)] - **src**: don't allow parallel calls to Update() (Trevor Norris) [#13](https://github.com/nodesource/nsolid/pull/13)
