import os
import subprocess
from pathlib import Path


class LatexCompiler:
    def compile(self, project_root: Path, tex_path: str) -> dict:
        root = project_root.resolve()
        source = (root / tex_path).resolve()

        source.relative_to(root)

        if not source.exists():
            raise FileNotFoundError(source)

        if source.suffix != ".tex":
            raise ValueError("LaTeX source must be a .tex file")

        latexmk = "/Library/TeX/texbin/latexmk"

        env = {
            **os.environ,
            "PATH": "/Library/TeX/texbin:" + os.environ.get("PATH", ""),
        }

        subprocess.run(
            [
                latexmk,
                "-c",
                source.name,
            ],
            cwd=root,
            capture_output=True,
            text=True,
            env=env,
        )

        result = subprocess.run(
            [
                latexmk,
                "-pdf",
                "-interaction=nonstopmode",
                "-halt-on-error",
                source.name,
            ],
            cwd=root,
            capture_output=True,
            text=True,
            env=env,
        )

        pdf_path = source.with_suffix(".pdf")

        success = result.returncode == 0

        return {
            "success": success,
            "pdf": (
                str(pdf_path.relative_to(root))
                if success and pdf_path.exists()
                else None
            ),
            "stdout": result.stdout,
            "stderr": result.stderr,
        }