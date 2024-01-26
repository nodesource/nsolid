# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

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
