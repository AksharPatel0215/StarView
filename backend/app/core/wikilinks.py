import re
from pathlib import Path
from urllib.parse import quote

LINK = re.compile(r"\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]+))?\]\]")
PREFIX = "https://starview.invalid/open/"


def active_text(content: str):
    """Yield source segments outside comments and common literal environments."""
    literal = False
    for line in content.splitlines(keepends=True):
        if re.search(r"\\begin\{(?:verbatim\*?|lstlisting|minted)\}", line):
            literal = True
        if literal:
            yield line, False
            if re.search(r"\\end\{(?:verbatim\*?|lstlisting|minted)\}", line):
                literal = False
            continue
        cursor = 0
        while cursor < len(line):
            verb = re.search(r"\\verb\*?([^\w\s]).*?\1", line[cursor:])
            comment = re.search(r"(?<!\\)(?:\\\\)*%", line[cursor:])
            if comment and (not verb or comment.start() < verb.start()):
                index = line.index('%', cursor + comment.start())
                yield line[cursor:index], True
                yield line[index:], False
                break
            if verb:
                start, end = cursor + verb.start(), cursor + verb.end()
                yield line[cursor:start], True
                yield line[start:end], False
                cursor = end
            else:
                yield line[cursor:], True
                break



def find_links(content: str):
    return [match for segment, active in active_text(content) if active for match in LINK.finditer(segment)]


def resolve_link(root: Path, source: str, target: str, documents: list[str]) -> str | None:
    root = root.resolve()
    target = target.strip()
    if not target or Path(target).is_absolute():
        return None
    candidate = target if target.lower().endswith('.tex') else target + '.tex'
    for path in (root / Path(source).parent / candidate, root / candidate):
        try:
            relative = path.resolve().relative_to(root).as_posix()
        except ValueError:
            continue
        if relative in documents:
            return relative
    matches = [path for path in documents if Path(path).name.casefold() == Path(candidate).name.casefold()]
    return matches[0] if '/' not in target and len(matches) == 1 else None


def escape_label(label: str) -> str:
    escapes = {'\\': r'\textbackslash{}', '&': r'\&', '%': r'\%', '$': r'\$', '#': r'\#', '_': r'\_', '{': r'\{', '}': r'\}', '~': r'\textasciitilde{}', '^': r'\textasciicircum{}'}
    return ''.join(escapes.get(char, char) for char in label)


def transform(root: Path, source: str, content: str, documents: list[str]) -> str:
    def replace(match):
        target = resolve_link(root, source, match.group(1), documents)
        label = escape_label((match.group(2) or match.group(1)).strip())
        if target is None:
            return label
        url = (PREFIX + quote(target, safe='')).replace('%', r'\%')
        return r'\href{' + url + '}{' + label + '}'
    return ''.join(LINK.sub(replace, segment) if active else segment for segment, active in active_text(content))
