# Contributing to N|Solid

## [Code of Conduct](./CODE_OF_CONDUCT.md)

The N|Solid project has a [Code of Conduct](./CODE_OF_CONDUCT.md) to which all
contributors must adhere.

## Issues and Pull Requests

Issues can be filed on the GitHub issue tracker at
<https://github.com/nodesource/nsolid/issues>.

In order to build this project, you will need a build environment capable of
building Node.js. See the included Node.js documentation for detailed
instructions.

* [Dependencies](./doc/contributing/pull-requests.md#dependencies)
* [Setting up your local environment](./doc/contributing/pull-requests.md#setting-up-your-local-environment)

## Documentation

* General [N|Solid Documentation](https://docs.nodesource.com/)
* [Node.js API Documentation](https://nodejs.org/docs/latest/api/)

## Releases

This project aligns with the Node.js project's release schedule, albeit with
its own versioning strategy. An N|Solid release corresponds with each Node.js
LTS release but does not always increment the MAJOR version. The numbering is
as follows:

| Node.js Version | NSolid Version              |
| --------------- | --------------------------- |
| v16.x.x         | v4.x.x [^*]                 |
| v18.x.x         | v4.0.0-v4.10.2 [^*], v5.x.x |
| v20.x.x         | v5.x.x                      |
| v22.x.x         | v5.x.x                      |

When there is a Node.js release, there will always be an associated N|Solid
release. This typically is made within 24 hours of the upstream Node.js release.
See the next section for more details on how the versions work and the
implications in `git` branches. When these releases happen, both the Node.js
version and the N|Solid version numbers will increase.

There can be N|Solid releases independent of Node.js releases, but these are
typically reserved for security releases or important N|Solid-specific bug
fixes. When these releases are made, the N|Solid version number will increase
(most likely a 'patch' version change), but the Node.js version number will stay
the same.

## N|Solid Version and branch strategy

### Branching

N|Solid development only happens on LTS versions. Once a future LTS version has
been released, the next main N|Solid development branch will be created on top
of the `vN.0.0` release of the future LTS branch.

When a new `vN.0.0 LTS` is released, the N|Solid commits will be squashed from
the latest release before the changes are landed on the latest tag. Reason is to
simplify the change rebase. There would potentially be many breaking or
conflicting commits that would need to be resolved which could take a lot of
time with little advantage to tracking change history.

The development branch's name will be `nsolid-vN.x` where `N` is the next
version of N|Solid. Node.js v20.x is linked to N|Solid v5.x.

The Node.js code will be merged into N|Solid's development branch at every tag.
No rebasing will be done once the development branch for a given LTS line has
been cut. This will help maintain the full history of all changes of the
development branch and minimize the effort of rebasing a full set of changes
every release. Below is an example graph of what it would look like having
merged two tags into the development branch:

```bash
    *   6fdae3941eb (HEAD -> nsolid-v6.x) src: fix implementation details
    *   97ffda657cf (tag: v20.6.0) 2023-08-XX, Version 20.6.0 (Current)
    |\
    | * 00fc8bb8b3d doc: add rluvaton to collaborators
    | * fab6f58edf8 Working on v20.5.2
    * | 4bfbe7e1800 Merge tag 'v20.5.1' into nsolid-oss-iron
    |\|
    | * 9f51c55a477 (tag: v20.5.1) 2023-08-09, Version 20.5.1 (Current)
    | * 7337d214840 policy: handle Module.constructor and main.extensions bypass
    * | f244610e4a7 agents: add linting for statsd agent
    * | 04b25fa21a9 deps: move statsd_agent to agents folder
```

If fixes are required to merge a Node.js tag, then a merge branch is created in
which the patch fixes land. The merge branch is then merged into the development
branch. The reason for this is so that a bisect can always have passing tests,
and all test failures will be within the merging branch.

### Choosing A Branch For Your Changes

Active development is done on the development branch of the latest (active) LTS
version. For the initial N|Solid open source release, this branch was
`nsolid-v5.x`. Prior to releases, relevant changes will be ported to the other
(maintenance) LTS branch.

### Releasing/Tagging

Tags are created by combining the version of Node.js and N|Solid using the
following pattern: `v<node_version>+ns<nsolid_version>`. A typical tag might
look like this: `v20.9.0+ns5.0.0`. N|Solid versioning adheres to semantic
versioning (semver) principles.

N|Solid versions will not automatically increment the MAJOR version with every
Node.js LTS release. Instead, a MAJOR version increment in N|Solid will only
occur when there are significant breaking changes or new, important features
introduced in N|Solid.

The adjustments in the N|Solid version are influenced by the Node.js version
updates.  For instance, if Node.js updates only involve a PATCH, then N|Solid
will similarly restrict its modifications to what would be deemed a PATCH
change, ensuring consistency and stability.

Unscheduled security updates in Node.js won't precipitate additional
alterations in N|Solid, facilitating swift deployment and maximum compatibility
during such critical updates.

When Node.js receives a PATCH version update, the corresponding N|Solid release
branch will originate from the last N|Solid release. Necessary patch
modifications will then be selectively incorporated from the development branch
to the N|Solid release branch.

Post the creation of a PATCH version's release branch in Node.js, the version
of Node.js will be integrated into the N|Solid release branch, ensuring
synchronization and continuity.

Occasionally, N|Solid might have releases that do not align with Node.js
releases. Such occurrences are rare and usually pertain to urgent PATCH
releases addressing crucial issues in N|Solid. N|Solid strives to align its
feature releases as closely as possible with the Node.js release schedule,
promoting harmony and predictability in the release cycles.

### Landing approved Pull Requests

Currently, N|Solid don't use the `commit-queue` label for landing PRs
on _default_ branch. Once the PR is mergeable a maintainer can land it using
`node-core-utils` to include the expected metadata.

```console
$ ncu-config set branch node-v20.x-nsolid-v5.x
$ git node land https://github.com/nodesource/nsolid/pull/X
```

## Technical Priorities

The N|Solid project aims to extend Node.js functionality to provide a unified
access point for access for infrastructure and developer tooling for
introspection and management of Node.js processes. It aims to collect, process,
and export data with the lightest possible overhead and contention with the
main Node.js process behavior.

Priorities:

* Minimal overhead and resource contention
* Enhancing visibility into Node.js process, `libuv`, and `V8` activity
* Centralized collection, processing, and dispatch from a separate isolated
  thread
* Additional introspection functionality added to any internal components
* Enhanced security, data privacy, reliability, or performance
* Secure 2-way communication for live-debugging or low-footprint interrogation
* Support for standard infrastructure tools and functionality (logging, service
  rotation)

## Does a change belong in N|Solid or Node.js?

We welcome collaboration and contribution, but please bear in mind the
priorities of the project, as these will determine the chances of your changes
being accepted. Fixes or supplemental changes to existing N|Solid behavior are
the most likely to see acceptance. Changes to Node.js internal behaviors are
generally going to require a much stronger case for addition to this project. In
all cases, the final decision to include a feature or not is up to the core
N|Solid team.

This project aims to keep the Node.js API as intact and 100% compatible as
possible. It is not a project aimed at working around the Node.js change
process, and proposed changes that will conflict with that compatibility are
almost certain to be rejected. It aims to add supplemental functionality with
the specific purpose of achieving the above technical priorities. These should
not interfere with the expected functionality of Node.js, except in the case of
stricter modes that must be enabled via the N|Solid API.

This project follows Node.js and if a feature from N|Solid becomes conflicting
with the upstream Node.js project, the standing decision is to adopt the
upstream Node.js solution. These sorts of changes have always been semver MAJOR
changes and allow N|Solid to also make breaking changes to its own API if
necessary to adopt upstream API changes.

This alone should suggest the ideal target for a feature aimed at the entire
Node.js audience is the Node.js project. If your feature lands there, it will
land here when the feature is part of a Node.js LTS release.

Belongs in Node.js:

* Features or Fixes to Node.js API functionality.

Belongs in N|Solid:

* Features or Fixes that target N|Solid-specific functionality
* Changes to Node.js behavior enabled via the N|Solid API

### Features or Fixes that target N|Solid-specific functionality

The N|Solid API aims to allow for extensions of functionality that target our
audience with the aforementioned priorities in mind. Examples might include
adding new metrics or tracing functionalities that use the N|Solid agent for
collection and transport, or adding additional metrics export endpoint types, or
fixes/changes to existing N|Solid behaviors.

### Changes to Node.js behavior enabled via the N|Solid API

The potential scope of the types of Node.js API changes is quite wide, but it is
also the least likely to land. These should have stricter functionality than
Node.js core behavior, and must be enabled by the N|Solid API.

The potential scope for a change like this would be something that immediately
enhances security or reliability but would require a semver major API change in
Node.js. A past example was zero-filling Buffers during allocation prior to the
`Buffer.alloc` upstream Node.js API changes. The N|Solid feature was removed in
versions of Node.js with safe Buffer allocation.

This type of change has a lot of potential, but also faces the biggest uphill
battle towards becoming a part of the project.

<a id="developers-certificate-of-origin"></a>

## Developer's Certificate of Origin 1.1

<pre>
By making a contribution to this project, I certify that:

 (a) The contribution was created in whole or in part by me and I
     have the right to submit it under the open source license
     indicated in the file; or

 (b) The contribution is based upon previous work that, to the best
     of my knowledge, is covered under an appropriate open source
     license and I have the right under that license to submit that
     work with modifications, whether created in whole or in part
     by me, under the same open source license (unless I am
     permitted to submit under a different license), as indicated
     in the file; or

 (c) The contribution was provided directly to me by some other
     person who certified (a), (b) or (c) and I have not modified
     it.

 (d) I understand and agree that this project and the contribution
     are public and that a record of the contribution (including all
     personal information I submit with it, including my sign-off) is
     maintained indefinitely and may be redistributed consistent with
     this project or the open source license(s) involved.
</pre>

[^*]: Significant breaking changes or the introduction of substantial features
    will drive the MAJOR version increments in N|Solid. Pre v5.0.0 versions of
    N|Solid are proprietary, and there will be no further enhancements to these
    closed versions.
