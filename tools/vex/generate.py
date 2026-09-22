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

STATUSES = {'not_affected', 'fixed'}

def validate_product(product):
  if isinstance(product, str):
    if not PRODUCT_PATTERN.fullmatch(product):
      raise ValueError(f'Invalid OpenVEX product: {product!r}')
  elif isinstance(product, dict):
    pid = product.get('@id')
    if not isinstance(pid, str) or not PRODUCT_PATTERN.fullmatch(pid):
      raise ValueError(f'Invalid OpenVEX product @id: {pid!r}')
    subs = product.get('subcomponents', [])
    if not isinstance(subs, list):
      raise ValueError(f'Invalid OpenVEX product subcomponents: {subs!r}')
    for s in subs:
      validate_product(s)
  else:
    raise ValueError(f'Invalid OpenVEX product: {product!r}')

def make_product(product):
  if product is None:
    return {'@id': 'pkg:generic/nodesource/nsolid'}
  if isinstance(product, str):
    return {'@id': product}
  return product

def validate_exception(exception):
  cve = exception.get('cve')
  status = exception.get('status', 'not_affected')
  justification = exception.get('justification')
  product = exception.get('product')
  impact_statement = exception.get('impact_statement')
  action_statement = exception.get('action_statement')
  if not isinstance(cve, str) or not CVE_PATTERN.fullmatch(cve):
    raise ValueError(f'Invalid CVE ID: {cve!r}')
  if status not in STATUSES:
    raise ValueError(f'Invalid OpenVEX status: {status!r}')
  if status == 'not_affected':
    if not isinstance(justification, str) or justification not in JUSTIFICATIONS:
      raise ValueError(f'Invalid OpenVEX justification: {justification!r}')
    if impact_statement is not None and not isinstance(impact_statement, str):
      raise ValueError(f'Invalid impact statement: {impact_statement!r}')
  elif status == 'fixed':
    if justification is not None:
      raise ValueError('Fixed statements must not include justification')
    if action_statement is not None and not isinstance(action_statement, str):
      raise ValueError(f'Invalid action statement: {action_statement!r}')
  if product is not None:
    validate_product(product)


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
        'products': [make_product(exception.get('product'))],
        'status': exception.get('status', 'not_affected'),
    }
    if statement['status'] == 'not_affected':
      statement['justification'] = exception['justification']
      if 'impact_statement' in exception:
        statement['impact_statement'] = exception['impact_statement']
    elif statement['status'] == 'fixed':
      if 'action_statement' in exception:
        statement['action_statement'] = exception['action_statement']

    statements.append(statement)
  if timestamp is None:
    timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
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
