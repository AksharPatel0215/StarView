from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from pydantic import BaseModel
from app.core.filesystem import FileSystem
from app.core.project_manager import ProjectManager
from app.models import Project
from app.core.latex import LatexCompiler


router = APIRouter(prefix="/api/projects")


project_manager = ProjectManager()


class ProjectCreate(BaseModel):
    name: str
    root: str


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
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid file path",
        )

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