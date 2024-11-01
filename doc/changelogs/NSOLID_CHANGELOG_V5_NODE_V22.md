# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

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
