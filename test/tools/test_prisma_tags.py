#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / 'tools' / 'vex'))
from prisma_tags import requests_for


class PrismaTagsTest(unittest.TestCase):
  def test_requests(self):
    nsolid = 'pkg:generic/nodesource/nsolid'
    document = {'timestamp': '2026-11-13T00:00:00Z', 'statements': [
        {'vulnerability': {'name': 'CVE-2099-0001'}, 'status': 'fixed',
         'products': [{'@id': nsolid, 'subcomponents': [{'@id': 'pkg:npm/pacote@19.0.2'}]}]},
        {'vulnerability': {'name': 'CVE-2099-0001'}, 'status': 'not_affected',
         'justification': 'vulnerable_code_not_in_execute_path',
         'products': [{'@id': nsolid, 'subcomponents': [{'@id': 'pkg:npm/pacote@20.0.1'}]}]},
        {'vulnerability': {'name': 'CVE-2099-0002'}, 'status': 'not_affected',
         'justification': 'component_not_present',
         'products': [{'@id': nsolid, 'subcomponents': [
             {'@id': 'pkg:npm/%40sigstore/core@2.0.0'}, {'@id': 'pkg:npm/joi'},
             {'@id': 'pkg:generic/zlib@1.3.1'}]}]},
    ]}
    planned = list(requests_for(document, 'nsolid openvex', 'image', ['app:*'], True))
    self.assertEqual(planned[0][:2], ('POST', '/api/v1/tags'))
    self.assertEqual(planned[0][2]['name'], 'nsolid openvex')
    self.assertEqual({path for _, path, _ in planned[1:]}, {'/api/v1/tags/nsolid%20openvex/vuln'})
    common = {'resourceType': 'image', 'resources': ['app:*'], 'checkBaseLayer': True}
    self.assertEqual([body for _, _, body in planned[1:]], [
        {'id': 'CVE-2099-0001', 'packageName': 'pacote', **common,
         'comment': 'N|Solid OpenVEX 2026-11-13: pacote 19.0.2 fixed; '
                    'pacote 20.0.1 not affected (vulnerable code not in execute path)'},
        {'id': 'CVE-2099-0002', 'packageName': '@sigstore/core', **common,
         'comment': 'N|Solid OpenVEX 2026-11-13: @sigstore/core 2.0.0 not affected '
                    '(component not present)'},
        {'id': 'CVE-2099-0002', 'packageName': 'joi', **common,
         'comment': 'N|Solid OpenVEX 2026-11-13: joi not affected (component not present)'},
    ])


if __name__ == '__main__':
  unittest.main()
