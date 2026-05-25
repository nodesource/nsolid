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
            for f in files:
                if testpy.LS_RE.match(f):
                    # Get relative path from the test root
                    rel_dir = os.path.relpath(root, path)
                    if rel_dir == '.':
                        result.append(f)
                    else:
                        result.append(os.path.join(rel_dir, f))
        return result

def GetConfiguration(context, root):
    return IntegrationTestConfiguration(context, root, 'integrations')
