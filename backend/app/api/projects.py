from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from pydantic import BaseModel
from app.core.filesystem import FileSystem
from app.core.project_manager import ProjectManager
from app.models import Project
from app.core.latex import LatexCompiler
from app.core.knowledge import KnowledgeGraph


router = APIRouter(prefix="/api/projects")


project_manager = ProjectManager()


class ProjectCreate(BaseModel):
    name: str
    root: str


@router.get("/local-directories")
def browse_local_directories(path: str | None = Query(default=None)):
    directory = Path(path).expanduser().resolve() if path else Path.home().resolve()
    try:
        if not directory.exists():
            raise HTTPException(status_code=404, detail="Directory not found")
        if not directory.is_dir():
            raise HTTPException(status_code=400, detail="Path must be a directory")
        directories = sorted(
            (entry for entry in directory.iterdir() if entry.is_dir() and not entry.name.startswith(".")),
            key=lambda entry: entry.name.casefold(),
        )
        return {
            "path": str(directory),
            "parent": str(directory.parent) if directory.parent != directory else None,
            "directories": [
                {"name": entry.name, "path": str(entry)} for entry in directories
            ],
        }
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied for this directory")


@router.get("")
def get_projects():
    projects = project_manager.get_projects()

    return [
        {
            "name": project.name,
            "root": str(project.root),
        }
        for project in projects
    ]


@router.post("")
def create_project(project_data: ProjectCreate):
    root = Path(project_data.root).expanduser().resolve()

    if not root.exists():
        raise HTTPException(
            status_code=400,
            detail="Project directory does not exist",
        )

    if not root.is_dir():
        raise HTTPException(
            status_code=400,
            detail="Project root must be a directory",
        )

    project = Project(
        name=project_data.name,
        root=root,
    )

    project_manager.add_project(project)

    return {
        "name": project.name,
        "root": str(project.root),
    }

@router.get("/{name}/files")
def get_project_files(name: str):
    files = project_manager.get_files(name)

    if files is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    return [str(path) for path in files]

@router.get("/{name}/files/{path:path}")
def read_project_file(name: str, path: str):
    project = project_manager.get_project(name)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    filesystem = FileSystem(project.root)

    try:
        content = filesystem.read_file(path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )
    except IsADirectoryError:
        raise HTTPException(status_code=400, detail="Select a file, not a directory")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied for this file")
    except UnicodeDecodeError:
        raise HTTPException(status_code=415, detail="This file cannot be opened as text")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file path")

    return {
        "path": path,
        "content": content,
    }

class FileUpdate(BaseModel):
    content: str


@router.put("/{name}/files/{path:path}")
def write_project_file(
    name: str,
    path: str,
    file_data: FileUpdate,
):
    project = project_manager.get_project(name)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    filesystem = FileSystem(project.root)

    try:
        filesystem.write_file(path, file_data.content)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid file path",
        )

    return {
        "path": path,
        "status": "saved",
    }


@router.post("/{name}/compile/{path:path}")
def compile_project_file(name: str, path: str):
    project = project_manager.get_project(name)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    compiler = LatexCompiler()

    try:
        result = compiler.compile(project.root, path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="LaTeX file not found",
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))

    if not result["success"]:
        raise HTTPException(
            status_code=422,
            detail=result,
        )

    return result

@router.get("/{name}/pdf/{path:path}")
def get_project_pdf(name: str, path: str):
    project = project_manager.get_project(name)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    pdf_path = (project.root / path).resolve()

    try:
        pdf_path.relative_to(project.root)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid file path",
        )

    if not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail="PDF not found",
        )

    if pdf_path.suffix != ".pdf":
        raise HTTPException(
            status_code=400,
            detail="File is not a PDF",
        )

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
    )


class DocumentConnection(BaseModel):
    source: str
    target: str


def graph_for_project(name: str) -> KnowledgeGraph:
    project = project_manager.get_project(name)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return KnowledgeGraph(project.root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid connections storage path")


@router.get("/{name}/connections")
def get_connections(name: str):
    try:
        return graph_for_project(name).graph()
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/{name}/connections")
def create_connection(name: str, connection: DocumentConnection):
    try:
        return graph_for_project(name).connect(connection.source, connection.target)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document not found")
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.delete("/{name}/connections")
def delete_connection(name: str, connection: DocumentConnection):
    try:
        return graph_for_project(name).disconnect(connection.source, connection.target)
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.get("/{name}/assets/{path:path}")
def get_project_asset(name: str, path: str):
    project = project_manager.get_project(name)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    asset = (project.root / path).resolve()
    try:
        asset.relative_to(project.root.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid asset path")
    if asset.suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        raise HTTPException(status_code=400, detail="Unsupported image format")
    if not asset.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(asset, headers={"X-Content-Type-Options": "nosniff"})
