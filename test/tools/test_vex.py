#!/usr/bin/env python3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / 'tools' / 'vex'))
from generate import generate_document, render_findings


class GenerateVEXTest(unittest.TestCase):
  def test_without_exceptions(self):
    document = generate_document([], '2026-01-01T00:00:00Z')
    self.assertEqual(document['statements'], [])

  def test_invalid_cve(self):
    with self.assertRaisesRegex(ValueError, 'Invalid CVE ID'):
      generate_document([{'cve': 'not-a-cve', 'justification': 'vulnerable_code_not_present'}])

  def test_invalid_justification(self):
    with self.assertRaisesRegex(ValueError, 'Invalid OpenVEX justification'):
      generate_document([{'cve': 'CVE-2099-0001', 'justification': 'invalid'}])

  def test_invalid_product(self):
    with self.assertRaisesRegex(ValueError, 'Invalid OpenVEX product'):
      generate_document([{'cve': 'CVE-2099-0001', 'justification':
                          'vulnerable_code_not_present', 'product': 'nsolid'}])

  def test_product_with_subcomponents(self):
    document = generate_document([{
        'cve': 'CVE-2099-0002',
        'status': 'fixed',
        'action_statement': 'Backported upstream fix.',
        'product': {
            '@id': 'pkg:generic/foo@1.0.0',
            'subcomponents': [{'@id': 'pkg:npm/bar@2.0.0'}],
        },
    }], '2026-01-01T00:00:00Z')
    product = document['statements'][0]['products'][0]
    self.assertEqual(product['@id'], 'pkg:generic/foo@1.0.0')
    self.assertEqual(product['subcomponents'][0]['@id'], 'pkg:npm/bar@2.0.0')

  def test_invalid_impact_statement(self):
    with self.assertRaisesRegex(ValueError, 'Invalid impact statement'):
      generate_document([{'cve': 'CVE-2099-0001', 'justification':
                          'vulnerable_code_not_present', 'impact_statement': 1}])

  def test_not_affected_exception(self):
    document = generate_document([{
        'cve': 'CVE-2099-0001',
        'justification': 'vulnerable_code_not_present',
        'impact_statement': 'Test-only exception.',
    }], '2026-01-01T00:00:00Z')
    statement = document['statements'][0]
    self.assertEqual(statement['status'], 'not_affected')
    self.assertEqual(statement['vulnerability']['name'], 'CVE-2099-0001')
    self.assertEqual(statement['justification'], 'vulnerable_code_not_present')
    self.assertEqual(statement['impact_statement'], 'Test-only exception.')

  def test_fixed_exception(self):
    document = generate_document([{
        'cve': 'CVE-2099-0002',
        'status': 'fixed',
        'action_statement': 'Backported upstream fix.',
    }], '2026-01-01T00:00:00Z')
    statement = document['statements'][0]
    self.assertEqual(statement['status'], 'fixed')
    self.assertEqual(statement['vulnerability']['name'], 'CVE-2099-0002')
    self.assertEqual(statement['action_statement'], 'Backported upstream fix.')
    self.assertNotIn('justification', statement)

  def test_fixed_with_justification_error(self):
    with self.assertRaisesRegex(ValueError, 'Fixed statements must not include justification'):
      generate_document([{
          'cve': 'CVE-2099-0003',
          'status': 'fixed',
          'justification': 'vulnerable_code_not_present',
      }])

  def test_verify_needs_fixed(self):
    with self.assertRaisesRegex(ValueError, 'Only fixed statements can have verify checks'):
      generate_document([{'cve': 'CVE-2099-0001', 'justification': 'vulnerable_code_not_present',
                          'verify': [{'path': 'a.js', 'contains': 'x'}]}])

  def test_invalid_verify(self):
    for verify in ([], [{'path': 'a.js'}], [{'path': '../a.js', 'contains': 'x'}],
                   [{'path': 'a.js', 'contains': ''}]):
      with self.assertRaisesRegex(ValueError, 'Invalid verify'):
        generate_document([{'cve': 'CVE-2099-0002', 'status': 'fixed', 'verify': verify}])

  def test_findings_page(self):
    with tempfile.TemporaryDirectory() as tmp:
      repo = Path(tmp)
      for rel, text in {
          'deps/npm/node_modules/foo/package.json': '{"name": "foo", "version": "1.0.0"}',
          'deps/npm/node_modules/bar/node_modules/foo/package.json':
              '{"name": "foo", "version": "2.0.0"}',
          'deps/ncm-ng/package.json': '{"dependencies": {"baz": "^1.0.0"}}',
          'src/node_version.h': '#define NODE_MAJOR_VERSION 99\n',
      }.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
      page = render_findings([
          {'cve': 'CVE-2099-0001', 'status': 'fixed', 'action_statement': 'Patched.',
           'product': {'@id': 'pkg:generic/nodesource/nsolid', 'subcomponents': [
               {'@id': 'pkg:npm/foo@1.0.0'}, {'@id': 'pkg:npm/foo@9.9.9'}]},
           'verify': [{'path': 'deps/npm/node_modules/foo/index.js', 'contains': 'fixed code'},
                      {'path': 'deps/other/index.js', 'contains': 'fixed code'}]},
          {'cve': 'CVE-2099-0002', 'justification': 'vulnerable_code_not_in_execute_path',
           'impact_statement': 'Never called.',
           'product': {'@id': 'pkg:generic/nodesource/nsolid', 'subcomponents': [
               {'@id': 'pkg:npm/foo@2.0.0'}, {'@id': 'pkg:npm/baz'},
               {'@id': 'pkg:npm/%40ns-private/ncm-ng@1.0.0',
                'subcomponents': [{'@id': 'pkg:npm/qux@3.0.0'}]},
               {'@id': 'pkg:generic/zlib@1.3.1'}]}},
      ], repo)
    self.assertIn('# Known scanner findings in N|Solid for Node.js 99\n', page)
    for row in (
        '| baz | [CVE-2099-0002](#cve-2099-0002) | Not affected | '
        '`lib/node_modules/ncm-ng/node_modules/baz` |',
        '| foo 1.0.0 | [CVE-2099-0001](#cve-2099-0001) | Fixed in place | '
        '`lib/node_modules/npm/node_modules/foo` |',
        '| foo 2.0.0 | [CVE-2099-0002](#cve-2099-0002) | Not affected | '
        '`lib/node_modules/npm/node_modules/bar/node_modules/foo` |',
        '| qux 3.0.0 | [CVE-2099-0002](#cve-2099-0002) | Not affected | '
        '`lib/node_modules/ncm-ng/node_modules/qux` |'):
      self.assertIn(row, page)
    self.assertIn('**foo 1.0.0: fixed in place.** Patched.', page)
    self.assertIn('**baz, foo 2.0.0, qux 3.0.0: not affected** '
                  '(vulnerable code not in execute path). Never called.', page)
    self.assertIn("grep -q 'fixed code' lib/node_modules/npm/node_modules/foo/index.js", page)
    # Only installed npm packages get rows; checks outside npm aren't shown.
    for absent in ('9.9.9', 'zlib', 'deps/other'):
      self.assertNotIn(absent, page)



if __name__ == '__main__':
  unittest.main()
