type FileTreeProps = {
  files: string[];
};


type TreeNode = {
  name: string;
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

    for (let i = 0; i < parts.length; i++)
    {
      const part = parts[i];
      let node = current.find((item) => item.name === part);

      if (!node)
      {
        node = {
          name: part,
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


function renderTree(nodes: TreeNode[])
{
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <li key={node.name}>
          {node.isFile ? node.name : `${node.name}/`}

          {node.children.length > 0 && renderTree(node.children)}
        </li>
      ))}
    </ul>
  );
}


function FileTree({ files }: FileTreeProps)
{
  const tree = buildTree(files);

  return renderTree(tree);
}


export default FileTree;