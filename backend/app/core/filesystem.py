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