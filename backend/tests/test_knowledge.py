import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.projects import project_manager
from app.core.knowledge import KnowledgeGraph
from app.core.filesystem import FileSystem
from app.core.latex import LatexCompiler
from app.main import app


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()
        (self.root / "main.tex").write_text(r"\documentclass{article}\title{A document}")
        (self.root / "chapters").mkdir()
        (self.root / "chapters" / "idea.tex").write_text("An idea")
        self.client = TestClient(app)
        project_manager.projects.clear()
        self.client.post("/api/projects", json={"name": "Knowledge", "root": str(self.root)})
        self.url = "/api/projects/Knowledge/connections"

    def tearDown(self):
        self.client.close()
        project_manager.projects.clear()
        self.directory.cleanup()

    def test_connection_persists_and_is_idempotent(self):
        link = {"source": "main.tex", "target": "chapters/idea.tex"}
        for _ in range(2):
            response = self.client.post(self.url, json=link)
            self.assertEqual(response.status_code, 200)
        graph = KnowledgeGraph(self.root).graph()
        self.assertEqual(graph["links"], [{**link, "missing": False}])
        self.assertEqual(graph["documents"][1]["title"], "A document")
        self.assertTrue(graph["documents"][1]["is_main"])
        self.assertEqual((self.root / "chapters/idea.tex").read_text(), "An idea")
        self.assertTrue((self.root / ".starview/links.json").is_file())

    def test_connection_rejects_escape_self_and_missing(self):
        for target, code in [("../outside.tex", 400), ("main.tex", 400), ("missing.tex", 404)]:
            response = self.client.post(self.url, json={"source": "main.tex", "target": target})
            self.assertEqual(response.status_code, code)
        self.assertFalse((self.root / ".starview/links.json").exists())

    def test_backlink_direction_and_remove(self):
        self.client.post(self.url, json={"source": "main.tex", "target": "chapters/idea.tex"})
        self.client.post(self.url, json={"source": "chapters/idea.tex", "target": "main.tex"})
        response = self.client.request("DELETE", self.url, json={"source": "main.tex", "target": "chapters/idea.tex"})
        self.assertEqual(response.json()["links"], [{"source": "chapters/idea.tex", "target": "main.tex", "missing": False}])

    def test_deleted_document_keeps_removable_missing_link(self):
        link = {"source": "main.tex", "target": "chapters/idea.tex"}
        self.client.post(self.url, json=link)
        (self.root / "chapters/idea.tex").unlink()
        self.assertTrue(self.client.get(self.url).json()["links"][0]["missing"])
        self.assertEqual(self.client.request("DELETE", self.url, json=link).json()["links"], [])

    def test_corrupt_metadata_is_not_overwritten(self):
        store = self.root / ".starview/links.json"
        store.parent.mkdir()
        store.write_text("broken json")
        response = self.client.post(self.url, json={"source": "main.tex", "target": "chapters/idea.tex"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(store.read_text(), "broken json")

    def test_graph_and_files_skip_internal_folders_and_external_symlinks(self):
        (self.root / ".starview").mkdir()
        (self.root / ".starview/hidden.tex").write_text("hidden")
        (self.root / "node_modules").mkdir()
        (self.root / "node_modules/dependency.tex").write_text("hidden")
        with tempfile.TemporaryDirectory() as outside:
            external = Path(outside) / "external.tex"
            external.write_text("outside")
            (self.root / "external.tex").symlink_to(external)
            self.assertEqual(len(KnowledgeGraph(self.root).graph()["documents"]), 2)
            self.assertEqual(len(FileSystem(self.root).list_files()), 2)

    def test_image_endpoint_and_traversal(self):
        (self.root / "picture.png").write_bytes(b"test image")
        response = self.client.get("/api/projects/Knowledge/assets/picture.png")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertEqual(self.client.get("/api/projects/Knowledge/assets/%2E%2E/picture.png").status_code, 400)
        self.assertEqual(self.client.get("/api/projects/Knowledge/assets/main.tex").status_code, 400)

    def test_nested_compile_preserves_path_and_uses_private_build_folder(self):
        source = self.root / "chapters/standalone.tex"
        source.write_text(r"\documentclass{article}\begin{document}Hello\end{document}")
        def run(arguments, **options):
            self.assertEqual(options["cwd"], self.root)
            self.assertEqual(arguments[-1], "./chapters/standalone.tex")
            build = Path(next(arg.split("=", 1)[1] for arg in arguments if arg.startswith("-outdir=")))
            self.assertEqual(build, self.root / ".starview/build/chapters/standalone")
            (build / "standalone.pdf").write_bytes(b"%PDF")
            from subprocess import CompletedProcess
            return CompletedProcess(arguments, 0, "success", "")
        with patch("app.core.latex.shutil.which", return_value="latexmk"), patch("app.core.latex.subprocess.run", side_effect=run):
            result = LatexCompiler().compile(self.root, "chapters/standalone.tex")
        self.assertEqual(result["pdf"], ".starview/build/chapters/standalone/standalone.pdf")
        self.assertNotIn(Path(result["pdf"]), FileSystem(self.root).list_files())


if __name__ == "__main__":
    unittest.main()
