type Props = { files: string[]; selectedFile?: string; onFileSelect: (file: string) => void };
type Node = { name: string; path: string; children: Node[]; isFile: boolean };
function build(files: string[]): Node[] {
  const root: Node[] = [];
  for (const file of files) {
    const parts = file.split("/"); let current = root; let path = "";
    parts.forEach((part, index) => {
      path = path ? `${path}/${part}` : part;
      let node = current.find(item => item.name === part);
      if (!node) { node = { name: part, path, children: [], isFile: index === parts.length - 1 }; current.push(node); }
      current = node.children;
    });
  }
  return root;
}
function Branch({ nodes, selectedFile, onFileSelect }: { nodes: Node[] } & Omit<Props, "files">) {
  return <ul className="file-tree">{[...nodes].sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name)).map(node => <li key={node.path}>
    {node.isFile ? <button className={selectedFile === node.path ? "active" : ""} title={node.path} onClick={() => onFileSelect(node.path)}><span className="file-icon" aria-hidden="true">{node.path.endsWith(".tex") ? "≡" : "◇"}</span>{node.name}</button>
      : <details open><summary>{node.name}</summary><Branch nodes={node.children} selectedFile={selectedFile} onFileSelect={onFileSelect} /></details>}
  </li>)}</ul>;
}
export default function FileTree({ files, ...props }: Props) { return <Branch nodes={build(files)} {...props} />; }
