# Security

## Reporting a security issue in N|Solid

Report security bugs in the N|Solid Runtime via <security@nodesource.com>

Normally your report will be acknowledged within 5 days, and you'll receive
a more detailed response to your report within 10 days indicating the
next steps in handling your submission. These timelines may extend when
our triage volunteers are away on holiday, particularly at the end of the
year.

After the initial reply to your report, the security team will endeavor to keep
you informed of the progress being made towards a fix and full announcement,
and may ask for additional information or guidance surrounding the reported
issue.

## Reporting a bug in a third party module

Security bugs in third party modules should be reported to their respective
maintainers.

## Disclosure policy

Here is the security disclosure policy for N|Solid

* The security report is received and is assigned a primary handler. This
  person will coordinate the fix and release process. The problem is validated
  against all supported versions. Once confirmed, a list of all affected
  versions is determined. Code is audited to find any potential similar
  problems. Fixes are prepared for all supported releases.
  These fixes are not committed to the public repository but rather held locally
  pending the announcement.

* If deemed necessary, an embargo date may be set and a delayed announcement
  may be coordinated to time the announcement with the release. Some NodeSource
  customers may be invited to be a part of the embargo and review team.

## Receiving security updates

Security notifications will be distributed via <https://nodesource.com/blog/>

## Vulnerability Exploitability eXchange (VEX)

N|Solid publishes an OpenVEX document with releases. It lists reviewed
vulnerabilities in bundled dependencies that do not affect N|Solid
(`not_affected`), or that N|Solid fixes in its own copy of the dependency
(`fixed`). The document is installed at `share/doc/nsolid/nsolid.openvex.json`.
It does not replace security advisories or the security reporting process
above.

[`tools/vex/SCANNER-FINDINGS.md`](tools/vex/SCANNER-FINDINGS.md) lists the same
statements for each npm package that N|Solid installs, with the package's path
and, for a fix made in N|Solid's copy, a command that checks for it.
[`tools/vex/prisma_tags.py`](tools/vex/prisma_tags.py) turns the statements
into Prisma Cloud tag assignments. Read its notes before using it: a tag also
hides the CVE in other copies of the package.

Maintainers add reviewed exceptions to `tools/vex/exceptions.json` and run
`python3 tools/vex/generate.py`, which regenerates `nsolid.openvex.json` and
`SCANNER-FINDINGS.md`. `make install` installs the document but doesn't
regenerate it. In `exceptions.json`:

* Each exception needs a CVE ID. A `not_affected` exception, the default, also
  needs a valid OpenVEX justification.
* A `fixed` exception for a fix made in N|Solid's copy of a package lists
  `verify` checks: files with a string that only the fixed code contains.
  `test/parallel/test-nsolid-vex-fixes.js` runs them, so an update that
  replaces a fixed file fails the test.
* An exception about packages that ncm-ng installs sets `installed_under` to
  `ncm-ng`. Otherwise its npm packages must be ones that npm bundles.

`test/tools/test_vex.py` fails when the committed `nsolid.openvex.json` or
`SCANNER-FINDINGS.md` doesn't match what `generate.py` makes.
