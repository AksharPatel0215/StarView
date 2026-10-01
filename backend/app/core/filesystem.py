import os
from pathlib import Path


class FileSystem:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def list_files(self) -> list[Path]:
        files = []
        for directory, children, names in os.walk(self.root):
            children[:] = sorted(child for child in children if child not in {".git", ".starview", ".venv", "venv", "node_modules", "__pycache__"})
            for name in sorted(names):
                path = Path(directory) / name
                try:
                    path.resolve().relative_to(self.root)
                except ValueError:
                    continue
                if path.is_file():
                    files.append(path.relative_to(self.root))
        return files

    def read_file(self, relative_path: str) -> str:
        path = (self.root / relative_path).resolve()

        path.relative_to(self.root)

        return path.read_text()

    def write_file(self, relative_path: str, content: str) -> None:
        path = (self.root / relative_path).resolve()

        path.relative_to(self.root)

        path.write_text(content)
