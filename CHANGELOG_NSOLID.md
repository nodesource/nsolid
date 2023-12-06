# N|Solid Changelog

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
