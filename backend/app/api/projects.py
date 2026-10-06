from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from pydantic import BaseModel
from app.core.filesystem import FileSystem
from app.core.project_manager import ProjectManager
from app.models import Project
from app.core.latex import LatexCompiler
from app.core.knowledge import KnowledgeGraph
from app.core.tags import FileTags
from app.core.folder_picker import choose_folder


router = APIRouter(prefix="/api/projects")


project_manager = ProjectManager()


class ProjectCreate(BaseModel):
    name: str
    root: str


@router.post("/choose-folder")
def pick_local_folder(request: Request):
    if request.client and request.client.host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(status_code=403, detail="Open folders on the local computer")
    try:
        return {"path": choose_folder()}
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))


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

class NewDocument(BaseModel):
    path: str
    content: str


@router.post("/{name}/files", status_code=201)
def create_project_file(name: str, data: NewDocument):
    project = project_manager.get_project(name)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        path = FileSystem(project.root).create_file(data.path, data.content)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="A file with that name already exists. Choose another name.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Choose a visible .tex file inside the workspace")
    except OSError:
        raise HTTPException(status_code=400, detail="Could not create this document. Check its folder and name.")
    return {"path": path, "status": "created"}


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


class TagUpdate(BaseModel):
    tags: list[str]


def tags_for_project(name: str):
    project = project_manager.get_project(name)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return FileTags(project.root)


@router.get("/{name}/tags")
def get_tags(name: str):
    try:
        return tags_for_project(name).all()
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.put("/{name}/tags/{path:path}")
def update_tags(name: str, path: str, data: TagUpdate):
    try:
        return tags_for_project(name).update(path, data.tags)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


class RelationshipLabels(BaseModel):
    source: str
    target: str
    labels: list[str]
    color: str | None = None


class GraphColor(BaseModel):
    kind: str
    key: str
    color: str | None = None


@router.put("/{name}/connections/labels")
def label_connection(name: str, data: RelationshipLabels):
    try:
        return graph_for_project(name).label_edge(data.source, data.target, data.labels, data.color)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.put("/{name}/graph/colors")
def set_graph_color(name: str, data: GraphColor):
    try:
        return graph_for_project(name).set_color(data.kind, data.key, data.color)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


class FileAction(BaseModel):
    source: str
    target: str | None = None


def file_action(name, operation, *args):
    from app.core.file_actions import FileActions
    project = project_manager.get_project(name)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return getattr(FileActions(project.root), operation)(*args)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="A file already exists at that location. Choose another name.")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File or trash item not found")
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/{name}/file-actions/move")
def move_file(name: str, data: FileAction):
    if data.target is None:
        raise HTTPException(status_code=400, detail="Choose a destination")
    return file_action(name, "move", data.source, data.target)


@router.post("/{name}/file-actions/delete")
def delete_file(name: str, data: FileAction):
    return file_action(name, "delete", data.source)


@router.get("/{name}/trash")
def list_trash(name: str):
    return file_action(name, "list_trash")


@router.post("/{name}/trash/{token}/restore")
def restore_file(name: str, token: str):
    return file_action(name, "restore", token)
