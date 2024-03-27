# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2024-03-27, Version 20.12.0-nsolid-v5.1.0 'Iron'

## Commits

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
