from pathlib import Path


class FileSystem:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def list_files(self) -> list[Path]:
        return [
            path.relative_to(self.root)
            for path in self.root.rglob("*")
            if path.is_file()
        ]

    def read_file(self, relative_path: str) -> str:
        path = (self.root / relative_path).resolve()

        path.relative_to(self.root)

        return path.read_text()

    def write_file(self, relative_path: str, content: str) -> None:
        path = (self.root / relative_path).resolve()

        path.relative_to(self.root)

        path.write_text(content)