#!/usr/bin/env python3
import hashlib
import json
from datetime import datetime, timezone
import re
import shlex
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).parent
REPO = ROOT.parents[1]
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

# Where packages land in an installation: npm's bundled packages under npm,
# and ncm-ng's dependencies, which its install script fetches at build time.
NPM_INSTALL_DIR = 'lib/node_modules/npm'
NCM_NG_INSTALL_DIR = 'lib/node_modules/ncm-ng'

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

def validate_verify(verify):
  # Each check names a repository file the fix lives in and a string that
  # only the fixed code contains. test-nsolid-vex-fixes.js runs the checks.
  if not isinstance(verify, list) or not verify:
    raise ValueError(f'Invalid verify checks: {verify!r}')
  for check in verify:
    if (not isinstance(check, dict) or set(check) != {'path', 'contains'} or
        not all(isinstance(v, str) and v for v in check.values()) or
        check['path'].startswith('/') or '..' in check['path'].split('/')):
      raise ValueError(f'Invalid verify check: {check!r}')

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
  verify = exception.get('verify')
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
  if verify is not None:
    if status != 'fixed':
      raise ValueError('Only fixed statements can have verify checks')
    validate_verify(verify)
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


def parse_npm_purl(purl):
  # pkg:npm/%40scope/name@1.2.3 -> ('@scope/name', '1.2.3'); no version -> None.
  if not purl.startswith('pkg:npm/'):
    return None
  spec = unquote(purl[len('pkg:npm/'):])
  if '@' in spec[1:]:
    name, version = spec.rsplit('@', 1)
    return name, version
  return spec, None

def bundled_npm_packages(repo):
  # (name, version) -> where each copy bundled with npm is installed.
  packages = {}
  npm = repo / 'deps' / 'npm'
  for manifest in sorted(npm.rglob('package.json')):
    rel = manifest.parent.relative_to(npm).as_posix()
    try:
      data = json.loads(manifest.read_text(encoding='utf-8'))
    except (OSError, ValueError):
      continue
    name = data.get('name')
    if isinstance(name, str) and rel.endswith(f'node_modules/{name}'):
      packages.setdefault((name, data.get('version')), []).append(
          f'{NPM_INSTALL_DIR}/{rel}')
  return packages

def ncm_ng_dependencies(repo):
  try:
    manifest = (repo / 'deps' / 'ncm-ng' / 'package.json').read_text(encoding='utf-8')
    return set(json.loads(manifest).get('dependencies', {}))
  except (OSError, ValueError):
    return set()

def leaf_packages(product, under_ncm_ng=False):
  # Yields (purl, under_ncm_ng) for each package a statement is about.
  subs = product.get('subcomponents', [])
  if not subs:
    yield product['@id'], under_ncm_ng
    return
  is_ncm_ng = unquote(product['@id']).startswith('pkg:npm/@ns-private/ncm-ng@')
  for sub in subs:
    yield from leaf_packages(sub, under_ncm_ng or is_ncm_ng)

def installed_paths(purl, under_ncm_ng, npm_packages, ncm_ng_deps):
  name, version = parse_npm_purl(purl) or (None, None)
  if name is None:
    return []
  paths = [path for (n, v), found in npm_packages.items()
           if n == name and version in (None, v) for path in found]
  if not paths and (under_ncm_ng or name in ncm_ng_deps):
    paths = [f'{NCM_NG_INSTALL_DIR}/node_modules/{name}']
  return paths

def installed_file(repo_path):
  prefix = 'deps/npm/'
  if repo_path.startswith(prefix):
    return f'{NPM_INSTALL_DIR}/{repo_path[len(prefix):]}'
  return None

def node_major(repo):
  try:
    header = (repo / 'src' / 'node_version.h').read_text(encoding='utf-8')
  except OSError:
    return None
  match = re.search(r'#define NODE_MAJOR_VERSION (\d+)', header)
  return match and match.group(1)

def render_findings(exceptions, repo=REPO):
  # A page for people whose scanners match versions: every installed package
  # a statement covers, what the statement says, and how to check a fix.
  npm_packages = bundled_npm_packages(repo)
  ncm_ng_deps = ncm_ng_dependencies(repo)
  rows = []
  for index, exception in enumerate(exceptions):
    status = exception.get('status', 'not_affected')
    checks = [(installed_file(c['path']), c['contains'])
              for c in exception.get('verify', [])]
    for purl, under_ncm_ng in leaf_packages(make_product(exception.get('product'))):
      for path in installed_paths(purl, under_ncm_ng, npm_packages, ncm_ng_deps):
        name, version = parse_npm_purl(purl)
        own_checks = [(f, s) for f, s in checks if f and f.startswith(f'{path}/')]
        if status == 'not_affected':
          label = 'Not affected'
        else:
          label = 'Fixed in place' if own_checks else 'Fixed'
        rows.append({
            'cve': exception['cve'], 'index': index, 'path': path,
            'package': f'{name} {version}' if version else name,
            'status': label, 'checks': own_checks,
        })
  rows.sort(key=lambda r: (r['package'], r['cve'], r['path']))

  major = node_major(repo)
  title = 'Known scanner findings' + (f' in N|Solid for Node.js {major}' if major else '')
  lines = [
      f'# {title}',
      '',
      '<!-- Generated by tools/vex/generate.py from exceptions.json. Edit that file, then run generate.py. -->',
      '',
      'Scanners that match package versions report these CVEs in packages that N|Solid installs. '
      "Each one is fixed in N|Solid's copy or doesn't affect N|Solid. "
      '[nsolid.openvex.json](nsolid.openvex.json) records the same statuses as an OpenVEX document, '
      'for scanners that can import one. Prisma Cloud can\'t, so '
      '[prisma_tags.py](prisma_tags.py) turns the statements into Prisma Cloud tag assignments.',
      '',
      'Paths are relative to the N|Solid installation directory: `/usr/local` in NodeSource\'s '
      'container images, or the directory a release tarball was extracted to.',
      '',
      '| Package | CVE | Status | Path |',
      '| --- | --- | --- | --- |',
  ]
  for r in rows:
    lines.append(f"| {r['package']} | [{r['cve']}](#{r['cve'].lower()}) | "
                 f"{r['status']} | `{r['path']}` |")

  def escape(text):
    return text.replace('\\', '\\\\').replace('*', '\\*').replace('_', '\\_')

  for cve in sorted({r['cve'] for r in rows}, key=lambda c: [int(n) for n in c.split('-')[1:]]):
    lines += ['', f'## {cve}']
    for index in sorted({r['index'] for r in rows if r['cve'] == cve}):
      exception = exceptions[index]
      own = [r for r in rows if r['index'] == index]
      packages = ', '.join(dict.fromkeys(r['package'] for r in own))
      checks = [c for r in own for c in r['checks']]
      if exception.get('status', 'not_affected') == 'not_affected':
        reason = exception['justification'].replace('_', ' ')
        lines += ['', f"**{packages}: not affected** ({reason}). "
                      f"{escape(exception.get('impact_statement', ''))}".rstrip()]
      else:
        fixed = 'fixed in place' if checks else 'fixed'
        lines += ['', f"**{packages}: {fixed}.** "
                      f"{escape(exception.get('action_statement', ''))}".rstrip()]
      if checks:
        lines += ['', 'To check for the fix, run this in the installation directory:', '', '```sh']
        lines += [f'grep -q {shlex.quote(s)} {shlex.quote(f)} && echo fixed || echo "not fixed"'
                  for f, s in dict.fromkeys(checks)]
        lines += ['```']
  return '\n'.join(lines) + '\n'


def main():
  exceptions = json.loads((ROOT / 'exceptions.json').read_text(encoding='utf-8'))
  document = generate_document(exceptions)
  vex = ROOT / 'nsolid.openvex.json'
  # Keep the old timestamp and @id unless a statement changed.
  if (not vex.exists() or
      json.loads(vex.read_text(encoding='utf-8')).get('statements') != document['statements']):
    vex.write_text(json.dumps(document, indent=2) + '\n', encoding='utf-8', newline='\n')
  (ROOT / 'SCANNER-FINDINGS.md').write_text(render_findings(exceptions),
                                           encoding='utf-8', newline='\n')

if __name__ == '__main__':
  main()
