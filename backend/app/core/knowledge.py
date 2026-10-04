import json
import os
import re
import tempfile
from pathlib import Path
from threading import RLock

from app.core.filesystem import FileSystem
from app.core.tags import FileTags
from app.core.graph_style import GraphStyle
from app.core.wikilinks import find_links, resolve_link

_LOCK = RLock()


class KnowledgeGraph:
    """Filesystem-backed, directed knowledge links between project documents."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.store = self.root / ".starview" / "links.json"
        # Never follow a metadata directory or file outside the project.
        self.store.resolve().relative_to(self.root)

    def _read_links(self) -> list[dict]:
        if not self.store.exists():
            return []
        data = json.loads(self.store.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("links"), list):
            raise ValueError("Invalid StarView connections file")
        links = data["links"]
        if any(not isinstance(link, dict) or not all(isinstance(link.get(key), str) for key in ("source", "target")) for link in links):
            raise ValueError("Invalid StarView connections file")
        return links

    def _document(self, path: str) -> str:
        document = (self.root / path).resolve()
        relative = document.relative_to(self.root).as_posix()
        if any(part.startswith(".") for part in Path(relative).parts):
            raise ValueError("Choose a visible LaTeX document")
        if document.suffix.lower() != ".tex":
            raise ValueError("Connections must link LaTeX documents")
        if not document.is_file():
            raise FileNotFoundError("Document not found")
        return relative

    def _write_links(self, links: list[dict]) -> None:
        self.store.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.store.parent, delete=False) as handle:
            temporary = Path(handle.name)
            json.dump({"version": 1, "links": links}, handle, indent=2)
            handle.write("\n")
        try:
            os.replace(temporary, self.store)
        finally:
            temporary.unlink(missing_ok=True)

    def connect(self, source: str, target: str) -> dict:
        source, target = self._document(source), self._document(target)
        if source == target:
            raise ValueError("Choose a different document to connect")
        with _LOCK:
            links = self._read_links()
            if not any(link["source"] == source and link["target"] == target for link in links):
                links.append({"source": source, "target": target})
                self._write_links(links)
        return self.graph()

    def disconnect(self, source: str, target: str) -> dict:
        # Missing documents can still have stale links removed.
        for path in (source, target):
            (self.root / path).resolve().relative_to(self.root)
        with _LOCK:
            links = self._read_links()
            self._write_links([link for link in links if not (link["source"] == source and link["target"] == target)])
        return self.graph()

    def graph(self) -> dict:
        style = GraphStyle(self.root).read()
        documents = []
        tags = FileTags(self.root).all()
        for relative in FileSystem(self.root).list_files():
            if relative.suffix.lower() != ".tex" or any(part.startswith(".") for part in relative.parts):
                continue
            path = self.root / relative
            try:
                path.resolve().relative_to(self.root)
                content = path.read_text(encoding="utf-8")
            except (ValueError, OSError):
                continue
            # Strip TeX comments so commented-out titles do not become names.
            content = re.sub(r"(?<!\\)%[^\n]*", "", content)
            title = re.search(r"\\title(?:\[[^\]]*\])?\s*\{([^{}]*)\}", content)
            documents.append({
                "path": relative.as_posix(),
                "tags": list(dict.fromkeys([tags[relative.as_posix()]["folder"], *tags[relative.as_posix()]["custom"]])),
                "title": title.group(1).strip() if title else relative.stem.replace("_", " "),
                "is_main": bool(re.search(r"\\documentclass(?:\[[^\]]*\])?\s*\{", content)),
            })
        documents.sort(key=lambda document: document["path"].casefold())
        paths = {document["path"] for document in documents}
        with _LOCK:
            links = [{"source": link["source"], "target": link["target"], "missing": link["source"] not in paths or link["target"] not in paths} for link in self._read_links()]
        inline = []
        for document in documents:
            content = (self.root / document["path"]).read_text(encoding="utf-8")
            for match in find_links(content):
                target = resolve_link(self.root, document["path"], match.group(1), sorted(paths))
                entry = {"source": document["path"], "target": target or match.group(1).strip(), "missing": target is None, "kind": "inline"}
                if entry not in inline:
                    inline.append(entry)
        for entry in inline:
            existing = next((link for link in links if link["source"] == entry["source"] and link["target"] == entry["target"]), None)
            if existing:
                existing["kind"] = "both"
            else:
                links.append(entry)
        overrides = {(edge["source"], edge["target"]): edge for edge in style["edges"]}
        for link in links:
            if metadata := overrides.get((link["source"], link["target"])):
                link["labels"] = metadata["labels"]
                link["color"] = metadata.get("color")
        return {"documents": documents, "links": links, "styles": {key: style[key] for key in ("tag_colors", "relationship_colors", "node_colors")}}

    def label_edge(self, source: str, target: str, labels: list[str], color: str | None = None) -> dict:
        source, target = self._document(source), self._document(target)
        if not any(link["source"] == source and link["target"] == target for link in self.graph()["links"]):
            raise FileNotFoundError("Connection not found")
        GraphStyle(self.root).edge(source, target, labels, color)
        return self.graph()

    def set_color(self, kind: str, key: str, color: str | None) -> dict:
        if kind == "node":
            key = self._document(key)
        GraphStyle(self.root).color(kind, key, color)
        return self.graph()
