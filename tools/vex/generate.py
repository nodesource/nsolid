#!/usr/bin/env python3
import hashlib
import json
from datetime import datetime, timezone
import re
from pathlib import Path

ROOT = Path(__file__).parent
CVE_PATTERN = re.compile(r'^CVE-[0-9]{4}-[0-9]{4,}$')
PRODUCT_PATTERN = re.compile(r'^pkg:[^\s]+$')
JUSTIFICATIONS = {
    'component_not_present',
    'vulnerable_code_not_present',
    'vulnerable_code_not_in_execute_path',
    'vulnerable_code_cannot_be_controlled_by_adversary',
    'inline_mitigations_already_exist',
}

def validate_exception(exception):
  cve = exception.get('cve')
  justification = exception.get('justification')
  product = exception.get('product')
  impact_statement = exception.get('impact_statement')
  if not isinstance(cve, str) or not CVE_PATTERN.fullmatch(cve):
    raise ValueError(f'Invalid CVE ID: {cve!r}')
  if not isinstance(justification, str) or justification not in JUSTIFICATIONS:
    raise ValueError(f'Invalid OpenVEX justification: {justification!r}')
  if product is not None and (not isinstance(product, str) or not PRODUCT_PATTERN.fullmatch(product)):
    raise ValueError(f'Invalid OpenVEX product: {product!r}')
  if impact_statement is not None and not isinstance(impact_statement, str):
    raise ValueError(f'Invalid impact statement: {impact_statement!r}')

def generate_document(exceptions, timestamp=None):
  for exception in exceptions:
    validate_exception(exception)
  statements = []
  for exception in exceptions:
    statement = {
        'vulnerability': {
            'name': exception['cve'],
            '@id': f"https://www.cve.org/CVERecord?id={exception['cve']}",
        },
        'products': [{
            '@id': exception.get('product', 'pkg:generic/nodesource/nsolid'),
        }],
        'status': 'not_affected',
        'justification': exception['justification'],
    }
    if 'impact_statement' in exception:
      statement['impact_statement'] = exception['impact_statement']

    statements.append(statement)
  timestamp = timestamp or datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
  document = {'version': 1, '@context': 'https://openvex.dev/ns/v0.2.0', 'author': 'N|Solid Security', 'role': 'Project', 'timestamp': timestamp, 'statements': statements}
  digest = hashlib.sha256(json.dumps(document, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
  document['@id'] = f'https://openvex.dev/docs/public/vex-{digest}'
  document = {'version': 1, '@context': document.pop('@context'), '@id': document.pop('@id'), **document}
  return document


def main():
  document = generate_document(json.loads((ROOT / 'exceptions.json').read_text()))
  (ROOT / 'nsolid.openvex.json').write_text(json.dumps(document, indent=2) + '\n')

if __name__ == '__main__':
  main()
