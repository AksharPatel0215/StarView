import json
import os
import tempfile
from pathlib import Path
from threading import RLock

from app.core.filesystem import FileSystem
from app.models import Project

class ProjectManager:
    def __init__(self):
        self.projects: dict[str, Project] = {}
        self.lock = RLock()
        self.store = Path(os.environ.get('STARVIEW_DATA_DIR', Path.home() / '.local' / 'share' / 'starview')) / 'projects.json'
        if self.store.exists():
            value = json.loads(self.store.read_text())
            if not isinstance(value, list):
                raise ValueError('Invalid local project registry')
            for item in value:
                root = Path(item['root']).resolve()
                if root.is_dir():
                    self.projects[item['name']] = Project(name=item['name'],root=root)

    def add_project(self, project: Project) -> None:
        with self.lock:
            self.projects[project.name] = project
            self.store.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with tempfile.NamedTemporaryFile('w',dir=self.store.parent,delete=False) as file:
                temporary=Path(file.name)
                json.dump([{'name':item.name,'root':str(item.root)} for item in self.projects.values()],file)
            try:
                os.replace(temporary,self.store)
            finally:
                temporary.unlink(missing_ok=True)

    def get_projects(self) -> list[Project]:
        return list(self.projects.values())

    def get_project(self, name: str) -> Project | None:
        return self.projects.get(name)

    def get_files(self, name: str) -> list[Path] | None:
        project = self.get_project(name)
        return FileSystem(project.root).list_files() if project else None
