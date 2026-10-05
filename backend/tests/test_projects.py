import tempfile
import unittest
from pathlib import Path

from support import TestClient

from app.api.projects import project_manager
from app.main import app


class ProjectFileTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.source = self.root / "main.tex"
        self.source.write_text("original")
        self.client = TestClient(app)
        project_manager.projects.clear()
        response = self.client.post(
            "/api/projects", json={"name": "Test Project", "root": str(self.root)}
        )
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        self.client.close()
        project_manager.projects.clear()
        self.directory.cleanup()

    def test_save_and_read_file(self):
        response = self.client.put(
            "/api/projects/Test%20Project/files/main.tex",
            json={"content": "updated LaTeX"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"path": "main.tex", "status": "saved"})
        self.assertEqual(self.source.read_text(), "updated LaTeX")
        response = self.client.get("/api/projects/Test%20Project/files/main.tex")
        self.assertEqual(response.json()["content"], "updated LaTeX")

    def test_save_unknown_project(self):
        response = self.client.put(
            "/api/projects/missing/files/main.tex", json={"content": "updated"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.source.read_text(), "original")

    def test_save_outside_project(self):
        response = self.client.put(
            "/api/projects/Test%20Project/files/%2E%2E/outside.tex",
            json={"content": "updated"},
        )
        self.assertEqual(response.status_code, 400)

    def test_save_requires_content(self):
        response = self.client.put(
            "/api/projects/Test%20Project/files/main.tex", json={}
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.source.read_text(), "original")


class LocalBrowsingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        (self.root / "nested folder").mkdir()
        (self.root / "main.tex").write_text("hello")
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.directory.cleanup()

    def test_browse_directories(self):
        (self.root / ".starview").mkdir()
        response = self.client.get("/api/projects/local-directories", params={"path": str(self.root)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "path": str(self.root), "parent": str(self.root.parent),
            "directories": [{"name": "nested folder", "path": str(self.root / "nested folder")}],
        })

    def test_browse_missing_directory(self):
        response = self.client.get("/api/projects/local-directories", params={"path": str(self.root / "missing")})
        self.assertEqual(response.status_code, 404)

    def test_browse_file_rejected(self):
        response = self.client.get("/api/projects/local-directories", params={"path": str(self.root / "main.tex")})
        self.assertEqual(response.status_code, 400)

    def test_open_folder_and_read_nested_file(self):
        nested = self.root / "nested folder" / "a # file.tex"
        nested.write_text("local contents")
        project_manager.projects.clear()
        response = self.client.post("/api/projects", json={"name": "Local Folder", "root": str(self.root)})
        self.assertEqual(response.status_code, 200)
        response = self.client.get("/api/projects/Local%20Folder/files")
        self.assertIn("nested folder/a # file.tex", response.json())
        response = self.client.get("/api/projects/Local%20Folder/files/nested%20folder/a%20%23%20file.tex")
        self.assertEqual(response.json()["content"], "local contents")
        project_manager.projects.clear()

    def test_binary_file_returns_helpful_error(self):
        (self.root / "image.png").write_bytes(b"\x89PNG\xff")
        project_manager.projects.clear()
        self.client.post("/api/projects", json={"name": "Local Folder", "root": str(self.root)})
        response = self.client.get("/api/projects/Local%20Folder/files/image.png")
        self.assertEqual(response.status_code, 415)
        project_manager.projects.clear()


if __name__ == "__main__":
    unittest.main()
