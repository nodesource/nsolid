# N|Solid Changelog

<!--lint disable maximum-line-length no-literal-urls prohibited-strings-->

## 2026-11-11, Version 26.13.1-nsolid-v6.3.10 'Lithium'

### Commits

* \[[`bb3a55889c`](https://github.com/nodesource/nsolid/commit/bb3a55889c)] - Merge tag 'v26.13.1' into node-v26.13.1-nsolid-v6.3.10-release (RafaelGSS) [#676](https://github.com/nodesource/nsolid/pull/676)
* \[[`414c5469ab`](https://github.com/nodesource/nsolid/commit/414c5469ab)] - **agents**: export latency histograms through OTLP (Santiago Gimeno) [#610](https://github.com/nodesource/nsolid/pull/610)
* \[[`f93778ee60`](https://github.com/nodesource/nsolid/commit/f93778ee60)] - **agents**: fix exit after snapshots while profiling (Bryce Baril) [#573](https://github.com/nodesource/nsolid/pull/573)
* \[[`c94c33edaa`](https://github.com/nodesource/nsolid/commit/c94c33edaa)] - **agents**: parse gRPC insecure flag safely (Santiago Gimeno) [#664](https://github.com/nodesource/nsolid/pull/664)
* \[[`a9457ef534`](https://github.com/nodesource/nsolid/commit/a9457ef534)] - **agents**: use current config for asset requests (Santiago Gimeno) [#659](https://github.com/nodesource/nsolid/pull/659)
* \[[`a4dc448c43`](https://github.com/nodesource/nsolid/commit/a4dc448c43)] - **agents**: identify vendor metric sources (Santiago Gimeno) [#657](https://github.com/nodesource/nsolid/pull/657)
* \[[`1f312a743c`](https://github.com/nodesource/nsolid/commit/1f312a743c)] - **agents**: format gRPC client certificate changes (Santiago Gimeno) [#574](https://github.com/nodesource/nsolid/pull/574)
* \[[`59aee4ae0d`](https://github.com/nodesource/nsolid/commit/59aee4ae0d)] - **agents**: identify Dynatrace thread gauges (Santiago Gimeno) [#656](https://github.com/nodesource/nsolid/pull/656)
* \[[`ff6a9996c7`](https://github.com/nodesource/nsolid/commit/ff6a9996c7)] - **agents**: seed vendor metric counter baselines (Santiago Gimeno) [#655](https://github.com/nodesource/nsolid/pull/655)
* \[[`a31286b1ff`](https://github.com/nodesource/nsolid/commit/a31286b1ff)] - **agents**: preserve negotiated ZMQ version (Santiago Gimeno) [#654](https://github.com/nodesource/nsolid/pull/654)
* \[[`e492dffc01`](https://github.com/nodesource/nsolid/commit/e492dffc01)] - **agents**: refresh StatsD format on config changes (Santiago Gimeno) [#653](https://github.com/nodesource/nsolid/pull/653)
* \[[`94a0755bf5`](https://github.com/nodesource/nsolid/commit/94a0755bf5)] - **agents**: reject malformed ZMQ commands (Santiago Gimeno) [#652](https://github.com/nodesource/nsolid/pull/652)
* \[[`d9e22cfd5f`](https://github.com/nodesource/nsolid/commit/d9e22cfd5f)] - **agents**: delete cached metrics for dead threads (Santiago Gimeno) [#431](https://github.com/nodesource/nsolid/pull/431)
* \[[`2112cdcb70`](https://github.com/nodesource/nsolid/commit/2112cdcb70)] - **agents**: fix OTLP gRPC endpoint security (Santiago Gimeno) [#628](https://github.com/nodesource/nsolid/pull/628)
* \[[`00d5e16a4e`](https://github.com/nodesource/nsolid/commit/00d5e16a4e)] - **agents**: fix ZMQ exit profile identifiers (Santiago Gimeno) [#597](https://github.com/nodesource/nsolid/pull/597)
* \[[`fc3f275161`](https://github.com/nodesource/nsolid/commit/fc3f275161)] - **agents**: fix gRPC ownership after auth failures (Santiago Gimeno) [#627](https://github.com/nodesource/nsolid/pull/627)
* \[[`d6c74eab96`](https://github.com/nodesource/nsolid/commit/d6c74eab96)] - **agents**: back off command stream reconnects (Santiago Gimeno) [#601](https://github.com/nodesource/nsolid/pull/601)
* \[[`67504e84ad`](https://github.com/nodesource/nsolid/commit/67504e84ad)] - **agents**: bound StatsD send queue processing (Santiago Gimeno) [#632](https://github.com/nodesource/nsolid/pull/632)
* \[[`0dfc81f6ed`](https://github.com/nodesource/nsolid/commit/0dfc81f6ed)] - **agents**: export span events and links (Santiago Gimeno) [#609](https://github.com/nodesource/nsolid/pull/609)
* \[[`c39353d9e6`](https://github.com/nodesource/nsolid/commit/c39353d9e6)] - **agents**: honor gRPC heap redaction requests (Santiago Gimeno) [#629](https://github.com/nodesource/nsolid/pull/629)
* \[[`d6035a04ad`](https://github.com/nodesource/nsolid/commit/d6035a04ad)] - **agents,deps,test**: fix client certificate recovery (Santiago Gimeno) [#574](https://github.com/nodesource/nsolid/pull/574)
* \[[`aeeed6166d`](https://github.com/nodesource/nsolid/commit/aeeed6166d)] - **agents,src**: format the exit reporting changes (Bryce Baril) [#573](https://github.com/nodesource/nsolid/pull/573)
* \[[`fd8a9ba4c8`](https://github.com/nodesource/nsolid/commit/fd8a9ba4c8)] - **agents,src**: report fatal exits and bound shutdown (Bryce Baril) [#573](https://github.com/nodesource/nsolid/pull/573)
* \[[`ae7d0b9638`](https://github.com/nodesource/nsolid/commit/ae7d0b9638)] - **agents,test**: support gRPC client certificates (Bryce Baril) [#574](https://github.com/nodesource/nsolid/pull/574)
* \[[`eddb5df9b9`](https://github.com/nodesource/nsolid/commit/eddb5df9b9)] - **deps**: cap the minimatch \*\*/.. split pass (Bryce Baril) [#674](https://github.com/nodesource/nsolid/pull/674)
* \[[`71b73483a8`](https://github.com/nodesource/nsolid/commit/71b73483a8)] - **(CVE-2026-118764)** **deps**: fix CVE-2026-118764 in minimatch (Bryce Baril) [#674](https://github.com/nodesource/nsolid/pull/674)
* \[[`74d844f873`](https://github.com/nodesource/nsolid/commit/74d844f873)] - **(CVE-2026-118764)** **deps**: fix CVE-2026-118764 in npm minimatch (Bryce Baril) [#674](https://github.com/nodesource/nsolid/pull/674)
* \[[`53df8b5ad9`](https://github.com/nodesource/nsolid/commit/53df8b5ad9)] - **deps**: fix CPU profile timestamp truncation (Santiago Gimeno) [#600](https://github.com/nodesource/nsolid/pull/600)
* \[[`9c3464c915`](https://github.com/nodesource/nsolid/commit/9c3464c915)] - **doc**: regenerate doc/node.1 (Santiago Gimeno)
* \[[`b9d51835dc`](https://github.com/nodesource/nsolid/commit/b9d51835dc)] - **doc,lib**: list the gRPC client certificate variables in --help (Bryce Baril) [#574](https://github.com/nodesource/nsolid/pull/574)
* \[[`832483a19a`](https://github.com/nodesource/nsolid/commit/832483a19a)] - **lib**: fix OpenTelemetry epoch time detection (Santiago Gimeno) [#663](https://github.com/nodesource/nsolid/pull/663)
* \[[`96546bf63e`](https://github.com/nodesource/nsolid/commit/96546bf63e)] - **lib**: capture http.route for HTTP metrics (Santiago Gimeno) [#431](https://github.com/nodesource/nsolid/pull/431)
* \[[`3974faa950`](https://github.com/nodesource/nsolid/commit/3974faa950)] - **lib**: fix OpenTelemetry span time inputs (Santiago Gimeno) [#631](https://github.com/nodesource/nsolid/pull/631)
* \[[`fadbb25155`](https://github.com/nodesource/nsolid/commit/fadbb25155)] - **lib,src**: fix metrics interval reconfiguration (Santiago Gimeno) [#472](https://github.com/nodesource/nsolid/pull/472)
* \[[`729116fd92`](https://github.com/nodesource/nsolid/commit/729116fd92)] - **lib,src,agents**: escape telemetry JSON strings (Santiago Gimeno) [#630](https://github.com/nodesource/nsolid/pull/630)
* \[[`7184653b55`](https://github.com/nodesource/nsolid/commit/7184653b55)] - **src**: correlate logs with the active span (Santiago Gimeno) [#661](https://github.com/nodesource/nsolid/pull/661)
* \[[`61fe415c0e`](https://github.com/nodesource/nsolid/commit/61fe415c0e)] - **src**: add HTTP latency histogram aggregation (Santiago Gimeno) [#431](https://github.com/nodesource/nsolid/pull/431)
* \[[`2711a7a6c4`](https://github.com/nodesource/nsolid/commit/2711a7a6c4)] - **src,agents**: add GC latency histograms (Santiago Gimeno) [#610](https://github.com/nodesource/nsolid/pull/610)
* \[[`dac0c1ba58`](https://github.com/nodesource/nsolid/commit/dac0c1ba58)] - **src,lib,agents**: add DNS latency histograms (Santiago Gimeno) [#610](https://github.com/nodesource/nsolid/pull/610)
* \[[`6d2a156adc`](https://github.com/nodesource/nsolid/commit/6d2a156adc)] - **src,test**: set up exit handlers for every startup (Bryce Baril) [#573](https://github.com/nodesource/nsolid/pull/573)
* \[[`13728353b3`](https://github.com/nodesource/nsolid/commit/13728353b3)] - **src,test**: abort if the watchdog cannot start (Bryce Baril) [#573](https://github.com/nodesource/nsolid/pull/573)
* \[[`782f5796ed`](https://github.com/nodesource/nsolid/commit/782f5796ed)] - **src,test**: end an abort even when stderr blocks (Bryce Baril) [#573](https://github.com/nodesource/nsolid/pull/573)
* \[[`43a0eb35a0`](https://github.com/nodesource/nsolid/commit/43a0eb35a0)] - **test**: initialize config for OTLP vendor metrics (Santiago Gimeno) [#668](https://github.com/nodesource/nsolid/pull/668)
* \[[`de38648712`](https://github.com/nodesource/nsolid/commit/de38648712)] - **test**: keep stderr assertions in the exit callback (Bryce Baril) [#573](https://github.com/nodesource/nsolid/pull/573)
* \[[`320d5a7a6e`](https://github.com/nodesource/nsolid/commit/320d5a7a6e)] - **test**: allow for command stream backoff in the client certificate tests (Bryce Baril) [#574](https://github.com/nodesource/nsolid/pull/574)
* \[[`4b8300087d`](https://github.com/nodesource/nsolid/commit/4b8300087d)] - **test**: wait for gRPC's own error about an unreadable client key (Bryce Baril) [#574](https://github.com/nodesource/nsolid/pull/574)
* \[[`1fa6549bf2`](https://github.com/nodesource/nsolid/commit/1fa6549bf2)] - **test**: add http.route integration coverage (Santiago Gimeno) [#431](https://github.com/nodesource/nsolid/pull/431)
* \[[`a35b54b603`](https://github.com/nodesource/nsolid/commit/a35b54b603)] - **test**: cover HTTP latency histogram metrics (Santiago Gimeno) [#431](https://github.com/nodesource/nsolid/pull/431)
* \[[`f03964717f`](https://github.com/nodesource/nsolid/commit/f03964717f)] - **vex**: add a statement for the joi finding (Bryce Baril) [#674](https://github.com/nodesource/nsolid/pull/674)
* \[[`e2ac110195`](https://github.com/nodesource/nsolid/commit/e2ac110195)] - **vex**: update the minimatch and brotli statements (Bryce Baril) [#674](https://github.com/nodesource/nsolid/pull/674)
* \[[`46877e26fa`](https://github.com/nodesource/nsolid/commit/46877e26fa)] - **vex**: record findings that don't affect N|Solid (Bryce Baril) [#674](https://github.com/nodesource/nsolid/pull/674)

## 2026-10-28, Version 26.13.0-nsolid-v6.3.9 'Lithium'

### Commits

* \[[`73e31c7286`](https://github.com/nodesource/nsolid/commit/73e31c7286)] - **src**: port N|Solid v6.3.9 to Node.js v26.13.0 (Santiago Gimeno)
