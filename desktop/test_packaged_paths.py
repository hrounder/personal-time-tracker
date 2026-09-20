import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SERVER_PATH = Path(__file__).resolve().parents[1] / "src" / "server.py"


class PackagedPathTests(unittest.TestCase):
    def test_frozen_app_reads_bundled_web_and_writes_beside_executable(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            temporary_root = Path(temporary_dir)
            bundle_root = temporary_root / "app"
            bundled_web = bundle_root / "src"
            bundled_web.mkdir(parents=True)
            executable = temporary_root / "时间记录" / "时间记录.exe"

            spec = importlib.util.spec_from_file_location(
                "packaged_server_test", SERVER_PATH
            )
            module = importlib.util.module_from_spec(spec)
            assert spec.loader is not None

            with (
                mock.patch.object(sys, "frozen", True, create=True),
                mock.patch.object(sys, "_MEIPASS", str(bundle_root), create=True),
                mock.patch.object(sys, "executable", str(executable)),
            ):
                spec.loader.exec_module(module)

            self.assertEqual(module.WEB_DIR, bundled_web)
            self.assertEqual(module.PROJECT_ROOT, executable.parent)

            module.ensure_storage()

            self.assertTrue((executable.parent / "data").is_dir())
            self.assertTrue((executable.parent / "config").is_dir())
            self.assertTrue((executable.parent / "backups").is_dir())
            self.assertTrue((executable.parent / "config" / "categories.json").is_file())


if __name__ == "__main__":
    unittest.main()
