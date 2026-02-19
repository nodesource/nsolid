import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import testpy

class IntegrationTestConfiguration(testpy.SimpleTestConfiguration):
    """Test configuration that finds test-*.mjs files in nested subdirectories."""

    def Ls(self, path):
        """Recursively find all test-*.mjs files in subdirectories, excluding node_modules."""
        result = []
        for root, dirs, files in os.walk(path):
            # Skip node_modules directories
            dirs[:] = [d for d in dirs if d != 'node_modules']
            result.extend(
                os.path.relpath(os.path.join(root, f), path).split(os.sep)
                for f in files if testpy.LS_RE.match(f))
        return result

    def ListTests(self, current_path, path, arch, mode):
        result = []
        for relative_path in self.Ls(self.root):
            test_path = current_path + relative_path
            test_name = test_path[:-1] + [os.path.splitext(test_path[-1])[0]]
            if self.Contains(path, test_name):
                result.append(testpy.SimpleTestCase(
                    test_name, os.path.join(self.root, *relative_path),
                    arch, mode, self.context, self, self.additional_flags))
        return result

def GetConfiguration(context, root):
    return IntegrationTestConfiguration(context, root, 'integrations')
