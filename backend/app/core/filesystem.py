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

    def create_file(self, relative_path: str, content: str) -> str:
        relative = Path(relative_path)
        if not relative_path.strip() or relative.is_absolute() or any(part in {"..", "."} or part.startswith(".") for part in relative.parts) or "\\" in relative_path:
            raise ValueError("Choose a visible file inside the workspace")
        if relative.suffix.lower() != ".tex":
            raise ValueError("New documents must use the .tex extension")
        path = self.root / relative
        path.resolve().relative_to(self.root)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation protects existing documents, including symlinks.
        with path.open("x", encoding="utf-8") as handle:
            handle.write(content)
        return relative.as_posix()
