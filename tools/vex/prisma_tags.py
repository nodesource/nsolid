#!/usr/bin/env python3
"""Tag the findings N|Solid's OpenVEX document covers in Prisma Cloud.

Prisma Cloud doesn't import OpenVEX documents. This script turns each
statement about an npm package in nsolid.openvex.json into a Prisma Cloud
tag assignment for that CVE and package, on the resources you name. A
vulnerability rule that ignores the tag then stops reporting them.

Tag assignments match packages by name, not by path or version, so they
also hide the same CVE in any other copy of the package on those resources,
such as one your application installs. Name only resources where the copy
N|Solid installs is the only one.

Without --apply, the script prints the requests it would send. With it, it
signs in with the access key and secret in PRISMA_ACCESS_KEY and
PRISMA_SECRET_KEY. Example:

  prisma_tags.py --console https://<console address> --resource-type image \\
      --resources 'registry.example.com/team/app:*' --apply
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path
from urllib.parse import quote, unquote

DEFAULT_VEX = Path(__file__).parent / 'nsolid.openvex.json'
RESOURCE_TYPES = ['image', 'host', 'function', 'codeRepo', '*']


def leaf_purls(product):
  subs = product.get('subcomponents', [])
  if not subs:
    yield product['@id']
  for sub in subs:
    yield from leaf_purls(sub)


def npm_findings(document):
  # {(CVE, npm package name): what the document says about each version}
  findings = {}
  for statement in document['statements']:
    status = statement['status'].replace('_', ' ')
    if 'justification' in statement:
      status += f" ({statement['justification'].replace('_', ' ')})"
    for product in statement['products']:
      for purl in leaf_purls(product):
        if not purl.startswith('pkg:npm/'):
          continue
        spec = unquote(purl[len('pkg:npm/'):])
        name, version = spec.rsplit('@', 1) if '@' in spec[1:] else (spec, '')
        notes = findings.setdefault((statement['vulnerability']['name'], name), [])
        notes.append(f'{name} {version} {status}'.replace('  ', ' '))
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
  with urllib.request.urlopen(request) as response:
    text = response.read().decode()
  return json.loads(text) if text else None


def main():
  parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
  parser.add_argument('--console', required=True,
                      help='Prisma Cloud Compute console address, as in its API URLs')
  parser.add_argument('--resource-type', required=True, choices=RESOURCE_TYPES)
  parser.add_argument('--resources', required=True, nargs='+',
                      help="resource names or patterns, or '*' for all")
  parser.add_argument('--base-layer', action='store_true',
                      help="images only: set Prisma's checkBaseLayer option")
  parser.add_argument('--tag', default='nsolid-openvex')
  parser.add_argument('--vex', default=DEFAULT_VEX, type=Path,
                      help='the OpenVEX document (default: %(default)s)')
  parser.add_argument('--apply', action='store_true', help='send the requests')
  args = parser.parse_args()

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
