#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / 'tools' / 'vex'))
from generate import generate_document


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


if __name__ == '__main__':
  unittest.main()
