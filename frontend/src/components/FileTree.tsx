type FileTreeProps = {
  files: string[];
  onFileSelect: (file: string) => void;
};


type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
};


function buildTree(files: string[]): TreeNode[]
{
  const root: TreeNode[] = [];

  for (const file of files)
  {
    const parts = file.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++)
    {
      const part = parts[i];

      currentPath = currentPath
        ? `${currentPath}/${part}`
        : part;

      let node = current.find((item) => item.name === part);

      if (!node)
      {
        node = {
          name: part,
          path: currentPath,
          children: [],
          isFile: i === parts.length - 1,
        };

        current.push(node);
      }

      current = node.children;
    }
  }

  return root;
}


function renderTree(
  nodes: TreeNode[],
  onFileSelect: (file: string) => void
)
{
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.isFile ? (
            <button onClick={() => onFileSelect(node.path)}>
              {node.name}
            </button>
          ) : (
            `${node.name}/`
          )}

          {node.children.length > 0 &&
            renderTree(node.children, onFileSelect)}
        </li>
      ))}
    </ul>
  );
}


function FileTree({ files, onFileSelect }: FileTreeProps)
{
  const tree = buildTree(files);

  return renderTree(tree, onFileSelect);
}


export default FileTree;