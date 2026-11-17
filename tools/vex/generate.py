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
NSOLID = 'pkg:generic/nodesource/nsolid'
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

# Where an installation keeps the npm packages a statement can name, by the
# exception's installed_under: npm's bundled packages, or the dependencies
# that ncm-ng's install script fetches when N|Solid is built.
INSTALL_DIRS = {'npm': 'lib/node_modules/npm', 'ncm-ng': 'lib/node_modules/ncm-ng'}

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
      # OpenVEX 0.2.0 subcomponents can't have subcomponents of their own.
      if not isinstance(s, dict) or 'subcomponents' in s:
        raise ValueError(f'Invalid OpenVEX subcomponent: {s!r}')
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
    return {'@id': NSOLID}
  if isinstance(product, str):
    return {'@id': product}
  return product

def fixed_product(product, version):
  # OpenVEX's fixed means "these product versions contain a fix", so name the
  # N|Solid version that the document comes with.
  if product['@id'] == NSOLID and version:
    product = {**product, '@id': f'{NSOLID}@{version}'}
  if '@' not in product['@id'].split('?')[0].split('#')[0]:
    raise ValueError(f"Fixed statements need a versioned product: {product['@id']!r}")
  return product

def validate_exception(exception):
  cve = exception.get('cve')
  status = exception.get('status', 'not_affected')
  justification = exception.get('justification')
  product = exception.get('product')
  impact_statement = exception.get('impact_statement')
  action_statement = exception.get('action_statement')
  verify = exception.get('verify')
  installed_under = exception.get('installed_under', 'npm')
  if not isinstance(cve, str) or not CVE_PATTERN.fullmatch(cve):
    raise ValueError(f'Invalid CVE ID: {cve!r}')
  if not isinstance(installed_under, str) or installed_under not in INSTALL_DIRS:
    raise ValueError(f'Invalid installed_under: {installed_under!r}')
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


def generate_document(exceptions, timestamp=None, version=None):
  for exception in exceptions:
    validate_exception(exception)
  statements = []
  for exception in exceptions:
    product = make_product(exception.get('product'))
    if exception.get('status') == 'fixed':
      product = fixed_product(product, version)
    statement = {
        'vulnerability': {
            'name': exception['cve'],
            '@id': f"https://www.cve.org/CVERecord?id={exception['cve']}",
        },
        'products': [product],
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


def package_purls(product):
  # The packages an OpenVEX product names: its subcomponents, or the product
  # itself when it has none.
  return [s['@id'] for s in product.get('subcomponents') or [product]]

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
  # (name, version) -> where npm's copies of that package are installed.
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
          f"{INSTALL_DIRS['npm']}/{rel}")
  return packages

def installed_paths(cve, purl, installed_under, npm_packages):
  name, version = parse_npm_purl(purl)
  if installed_under == 'ncm-ng':
    # Fetched when N|Solid is built, so the repository can't confirm versions.
    return [f"{INSTALL_DIRS['ncm-ng']}/node_modules/{name}"]
  paths = [path for (n, v), found in npm_packages.items()
           if n == name and version in (None, v) for path in found]
  if not paths:
    # Most likely an npm update replaced the package the statement is about.
    raise ValueError(f"{cve}: npm doesn't bundle {purl}. Update the statement, or set "
                     'installed_under if the package is installed somewhere else.')
  return paths

def installed_file(repo_path):
  prefix = 'deps/npm/'
  if repo_path.startswith(prefix):
    return f"{INSTALL_DIRS['npm']}/{repo_path[len(prefix):]}"
  return None

def version_macros(repo):
  # {'NODE_MAJOR_VERSION': '26', 'NSOLID_PATCH_VERSION': '10', ...}
  header = (repo / 'src' / 'node_version.h').read_text(encoding='utf-8')
  return dict(re.findall(r'^#define (\w+_VERSION) (\d+)$', header, re.MULTILINE))

def nsolid_version(repo=REPO):
  macros = version_macros(repo)
  return '.'.join(macros[f'NSOLID_{part}_VERSION'] for part in ('MAJOR', 'MINOR', 'PATCH'))

def render_findings(exceptions, repo=REPO):
  # A page for people whose scanners match versions: every installed npm
  # package a statement covers, what the statement says, and how to check a
  # fix.
  npm_packages = bundled_npm_packages(repo)
  rows = []
  for index, exception in enumerate(exceptions):
    status = exception.get('status', 'not_affected')
    checks = [(installed_file(c['path']), c['contains'])
              for c in exception.get('verify', [])]
    for purl in package_purls(make_product(exception.get('product'))):
      if not purl.startswith('pkg:npm/'):
        continue
      name, version = parse_npm_purl(purl)
      for path in installed_paths(exception['cve'], purl,
                                  exception.get('installed_under', 'npm'), npm_packages):
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

  major = version_macros(repo)['NODE_MAJOR_VERSION']
  lines = [
      f'# Known scanner findings in N|Solid for Node.js {major}',
      '',
      '<!-- Generated by tools/vex/generate.py from exceptions.json. Edit that file, then run generate.py. -->',
      '',
      'Scanners that match package versions report these CVEs in npm packages that N|Solid installs. '
      "Each one is fixed in N|Solid's copy or doesn't affect N|Solid. "
      '[nsolid.openvex.json](nsolid.openvex.json) records the same statuses as an OpenVEX document. '
      '[prisma_tags.py](prisma_tags.py) turns them into Prisma Cloud tag assignments. Read its notes '
      'first: a tag also hides the CVE in other copies of the package, and in other N|Solid releases, '
      'on the same resources.',
      '',
      'Paths are relative to the N|Solid installation directory, the one that contains `bin/nsolid`. '
      'On Windows, it contains `nsolid.exe`, and the paths start at `node_modules` rather than '
      '`lib/node_modules`. The commands that check for fixes use `grep`, so on Windows, run them in '
      'Git Bash or WSL.',
      '',
      '| Package | CVE | Status | Path |',
      '| --- | --- | --- | --- |',
  ]
  lines.extend(f"| {r['package']} | [{r['cve']}](#{r['cve'].lower()}) | "
               f"{r['status']} | `{r['path']}` |" for r in rows)

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


def write(path, text):
  # LF on every platform. Path.write_text() takes newline= only in 3.10+.
  with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)


def main():
  exceptions = json.loads((ROOT / 'exceptions.json').read_text(encoding='utf-8'))
  vex = ROOT / 'nsolid.openvex.json'
  old = json.loads(vex.read_text(encoding='utf-8')) if vex.exists() else {}
  version = nsolid_version()
  # Keep the old timestamp, and with it the old @id, unless the content changed.
  document = generate_document(exceptions, old.get('timestamp'), version)
  if document != old:
    document = generate_document(exceptions, version=version)
  # Render the page first: it fails for a stale statement.
  page = render_findings(exceptions)
  write(vex, json.dumps(document, indent=2) + '\n')
  write(ROOT / 'SCANNER-FINDINGS.md', page)

if __name__ == '__main__':
  main()
