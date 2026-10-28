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

N|Solid publishes an OpenVEX document with releases to identify vulnerabilities
in bundled dependencies that do not affect N|Solid. The document is installed at
`share/doc/nsolid/nsolid.openvex.json` and contains only reviewed
`not_affected` statements; it does not replace security advisories or the
security reporting process above.

Maintainers add reviewed exceptions to `tools/vex/exceptions.json` and
regenerate the document with `make install` (or `python3 tools/vex/generate.py`)
when preparing a release. Each exception must include a CVE ID and a valid
OpenVEX justification.
