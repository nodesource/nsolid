# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2024-07,08, Version 5.3.1 'Hydrogen'

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
