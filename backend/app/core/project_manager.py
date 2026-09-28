from pathlib import Path

from app.core.filesystem import FileSystem
from app.models import Project


class ProjectManager:
    def __init__(self):
        self.projects: dict[str, Project] = {}

    def add_project(self, project: Project) -> None:
        self.projects[project.name] = project

    def get_projects(self) -> list[Project]:
        return list(self.projects.values())

    def get_project(self, name: str) -> Project | None:
        return self.projects.get(name)

    def get_files(self, name: str) -> list[Path] | None:
        project = self.get_project(name)

        if project is None:
            return None

        filesystem = FileSystem(project.root)

        return filesystem.list_files()
    