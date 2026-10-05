import os
import re
import tempfile
import shutil
import subprocess
from pathlib import Path
from contextlib import nullcontext
from app.core.filesystem import FileSystem
from app.core.wikilinks import transform, find_links, active_text


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
        files = FileSystem(root).list_files()
        documents = [path.as_posix() for path in files if path.suffix.lower() == ".tex"]
        has_links = any(find_links((root / path).read_text(encoding="utf-8")) for path in files if path.suffix.lower() == ".tex")
        context = tempfile.TemporaryDirectory(prefix="sources-", dir=build) if has_links else nullcontext(root)
        with context as staging:
            stage = Path(staging)
            for path in files if has_links else []:
                if path.suffix.lower() in {".aux", ".log", ".fls", ".fdb_latexmk", ".synctex", ".bbl", ".blg"}:
                    continue
                destination = stage / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                if path.suffix.lower() == ".tex":
                    content = transform(root, path.as_posix(), (root / path).read_text(encoding="utf-8"), documents)
                    if path == relative:
                        active_content = "".join(segment for segment, active in active_text(content) if active)
                        packages = re.findall(r"\\usepackage(?:\[[^\]]*\])?\s*\{([^}]*)\}", active_content)
                        if not any("hyperref" in [item.strip() for item in names.split(",")] for names in packages):
                            pieces = []
                            inserted = False
                            for segment, active in active_text(content):
                                if active and not inserted:
                                    segment, count = re.subn(r"\\begin\s*\{document\}", lambda match: r"\usepackage{hyperref}" + "\n" + match.group(0), segment, count=1)
                                    inserted = bool(count)
                                pieces.append(segment)
                            content = "".join(pieces)
                    destination.write_text(content, encoding="utf-8")
                else:
                    shutil.copy2(root / path, destination)
            try:
                result = subprocess.run(
                    [latexmk, "-norc", "-no-shell-escape", "-pdf", "-interaction=nonstopmode", "-halt-on-error",
                     f"-outdir={build}", f"./{relative.as_posix()}"],
                    cwd=stage, capture_output=True, text=True, env=env, timeout=120,
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
