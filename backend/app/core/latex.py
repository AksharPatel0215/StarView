import os
import shutil
import subprocess
from pathlib import Path


class LatexCompiler:
    def compile(self, project_root: Path, tex_path: str) -> dict:
        root = project_root.resolve()
        source = (root / tex_path).resolve()
        relative = source.relative_to(root)
        if not source.is_file():
            raise FileNotFoundError(source)
        if source.suffix.lower() != ".tex":
            raise ValueError("LaTeX source must be a .tex file")

        env = {**os.environ, "PATH": "/Library/TeX/texbin:" + os.environ.get("PATH", "")}
        latexmk = shutil.which("latexmk", path=env["PATH"])
        if not latexmk:
            raise RuntimeError("LaTeX compiler not found. Install MacTeX or TeX Live with latexmk.")
        build = (root / ".starview" / "build" / relative.with_suffix("")).resolve()
        build.relative_to(root)
        build.mkdir(parents=True, exist_ok=True)
        try:
            result = subprocess.run(
                [latexmk, "-pdf", "-interaction=nonstopmode", "-halt-on-error",
                 f"-outdir={build}", f"./{relative.as_posix()}"],
                cwd=root, capture_output=True, text=True, env=env, timeout=120,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Compilation timed out after two minutes")
        pdf_path = build / source.with_suffix(".pdf").name
        success = result.returncode == 0 and pdf_path.is_file()
        return {
            "success": success,
            "pdf": pdf_path.relative_to(root).as_posix() if success else None,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
