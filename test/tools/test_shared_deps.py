import itertools
import shutil
import sys
import tempfile
import unittest
import warnings
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(ROOT / 'tools/gyp/pylib'))
import gyp


class SharedDependenciesTest(unittest.TestCase):
  def test_slim_and_bundled_dependencies(self):
    files = ['curl/curl.gyp', 'grpc/grpc.gyp',
             'opentelemetry-cpp/otlp-http-exporter.gyp',
             'protobuf/protobuf.gyp', 'protobuf/abseil.gyp',
             'protobuf/utf8_range.gyp']
    libraries = ['openssl', 'zlib', 'cares']
    for shared in itertools.product((True, False), repeat=len(libraries)):
      with self.subTest(shared=shared), tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for file in files:
          destination = root / 'deps' / file
          destination.parent.mkdir(parents=True, exist_ok=True)
          shutil.copyfile(ROOT / 'deps' / file, destination)
        variables = {'OS': 'linux', 'CONFIGURATION_NAME': 'Release'}
        for library, use_shared in zip(libraries, shared):
          variables['node_shared_' + library] = 'true' if use_shared else 'false'
          if not use_shared:
            dependency = root / 'deps' / library / (library + '.gyp')
            dependency.parent.mkdir(parents=True, exist_ok=True)
            dependency.write_text(repr({'targets': [
                {'target_name': library, 'type': 'none'}]}))
        with warnings.catch_warnings():
          # GYP's loader relies on implicit file closure.
          warnings.filterwarnings('ignore', category=ResourceWarning, module=r'gyp\.input')
          _, _, targets, _ = gyp.Load(
              [str(root / 'deps/opentelemetry-cpp/otlp-http-exporter.gyp')],
              'gypd', default_variables=variables, depth=str(root),
              params={'options': SimpleNamespace(generator_output=None,
                                                 toplevel_dir=str(root)),
                      'parallel': False, 'root_targets': None})
        names = {target['target_name'] for target in targets.values()}
        for library, use_shared in zip(libraries, shared):
          self.assertEqual(library in names, not use_shared)


if __name__ == '__main__':
  unittest.main()
