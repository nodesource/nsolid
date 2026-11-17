#!/usr/bin/env python3
"""Tag the findings in N|Solid's OpenVEX document in Prisma Cloud.

This script turns each statement about an npm package in an N|Solid OpenVEX
document into a Prisma Cloud tag assignment for that CVE and package, on the
resources you name. A vulnerability rule that ignores the tag then stops
reporting them. Know what an assignment hides before you send any:

- Prisma Cloud matches an assignment by CVE and package name, not by version
  or path. On the resources you name, it also hides the CVE in any other copy
  of the package, such as one your application installs, and in N|Solid
  releases that the document doesn't cover, such as ones from before a fix.
  Name only resources that run the N|Solid release the document comes with
  (share/doc/nsolid/nsolid.openvex.json in its installation directory), and
  where N|Solid's copy is the only copy of each package.
- Prisma Cloud identifies an assignment by CVE, package name, resource type
  and tag, and sending it again replaces it. A second run for other resources
  therefore replaces the first run's resources, so name them all in one run.
- The script only adds assignments. When a later document drops or changes
  a statement, remove or change its assignment in Prisma Cloud yourself.

Without --apply, the script prints the requests it would send. With it, it
signs in with the access key and secret in PRISMA_ACCESS_KEY and
PRISMA_SECRET_KEY. Example:

  python3 tools/vex/prisma_tags.py --console https://<console address> \\
      --resource-type image --resources 'registry.example.com/team/app:*' --apply
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path
from urllib.parse import quote

from generate import package_purls, parse_npm_purl

DEFAULT_VEX = Path(__file__).parent / 'nsolid.openvex.json'
RESOURCE_TYPES = ['image', 'host', 'function', 'codeRepo', '*']


def npm_findings(document):
  # {(CVE, npm package name): what the document says about each version}
  findings = {}
  for statement in document['statements']:
    status = statement['status'].replace('_', ' ')
    if 'justification' in statement:
      status += f" ({statement['justification'].replace('_', ' ')})"
    for product in statement['products']:
      for purl in package_purls(product):
        npm = parse_npm_purl(purl)
        if npm is None:
          continue
        name, version = npm
        notes = findings.setdefault((statement['vulnerability']['name'], name), [])
        notes.append(' '.join(filter(None, (name, version, status))))
  return findings


def requests_for(document, tag, resource_type, resources, base_layer):
  yield 'POST', '/api/v1/tags', {
      'name': tag, 'color': '#3d8b40',
      'description': "Fixed in N|Solid's copy, or not affected, per N|Solid's OpenVEX document",
  }
  date = document.get('timestamp', '')[:10]
  for (cve, package), notes in sorted(npm_findings(document).items()):
    body = {
        'id': cve, 'packageName': package, 'resourceType': resource_type,
        'resources': resources, 'comment': f"N|Solid OpenVEX {date}: {'; '.join(notes)}",
    }
    if base_layer:
      body['checkBaseLayer'] = True
    yield 'POST', f'/api/v1/tags/{quote(tag)}/vuln', body


def call(console, token, method, path, body=None):
  headers = {'Content-Type': 'application/json'}
  if token:
    headers['Authorization'] = f'Bearer {token}'
  request = urllib.request.Request(
      console.rstrip('/') + path, method=method, headers=headers,
      data=None if body is None else json.dumps(body).encode())
  with urllib.request.urlopen(request, timeout=60) as response:
    text = response.read().decode()
  return json.loads(text) if text else None


def main(argv=None):
  parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
  parser.add_argument('--console', required=True,
                      help='Prisma Cloud Compute console address, as in its API URLs')
  parser.add_argument('--resource-type', required=True, choices=RESOURCE_TYPES)
  parser.add_argument('--resources', required=True, nargs='+',
                      help='resource names or patterns, such as registry/repository:*')
  parser.add_argument('--all-resources', action='store_true',
                      help="allow '*' as the resource type or a resource, which tags every one")
  parser.add_argument('--base-layer', action='store_true',
                      help="images only: set Prisma Cloud's checkBaseLayer option")
  parser.add_argument('--tag', default='nsolid-openvex')
  parser.add_argument('--vex', default=DEFAULT_VEX, type=Path,
                      help='the OpenVEX document (default: %(default)s)')
  parser.add_argument('--apply', action='store_true', help='send the requests')
  args = parser.parse_args(argv)
  if '*' in (args.resource_type, *args.resources) and not args.all_resources:
    parser.error("'*' tags every resource of that type, and a tag also hides these CVEs in "
                 'other copies of the packages there. Name the resources, or pass --all-resources.')
  if args.base_layer and args.resource_type != 'image':
    parser.error('--base-layer applies only to --resource-type image')

  document = json.loads(args.vex.read_text(encoding='utf-8'))
  planned = list(requests_for(document, args.tag, args.resource_type,
                              args.resources, args.base_layer))
  if not args.apply:
    for method, path, body in planned:
      print(method, path, json.dumps(body))
    print('Nothing sent. Run again with --apply to send these requests.', file=sys.stderr)
    return

  key, secret = os.environ.get('PRISMA_ACCESS_KEY'), os.environ.get('PRISMA_SECRET_KEY')
  if not key or not secret:
    sys.exit('Set PRISMA_ACCESS_KEY and PRISMA_SECRET_KEY to use --apply.')
  token = call(args.console, None, 'POST', '/api/v1/authenticate',
               {'username': key, 'password': secret})['token']
  tags = {t.get('name') for t in call(args.console, token, 'GET', '/api/v1/tags') or []}
  for method, path, body in planned:
    if path == '/api/v1/tags' and body['name'] in tags:
      continue
    call(args.console, token, method, path, body)
    print(method, path, body.get('id', body['name']), body.get('packageName', ''))
  print(f"Done. In each vulnerability rule that covers these resources, add the tag "
        f"'{args.tag}' under Advanced settings, with the Ignore effect.")


if __name__ == '__main__':
  main()
