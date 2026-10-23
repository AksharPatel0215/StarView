import type {DocumentNode} from './api/client';
import type {KnowledgeNode} from './knowledgeHierarchy';
export type WorkspaceEntry={id:string;title:string;kind:'folder'|'document'|'dashboard'|'flashcards'|'data';children:WorkspaceEntry[];level?:string};
export function workspaceTree(nodes:KnowledgeNode[],files:string[],documents:DocumentNode[],query=''):WorkspaceEntry[]{
 const byId=new Map(nodes.map(n=>[n.id,n]));const byPath=new Map(documents.map(d=>[d.path,d]));const allowed=new Set(files);const assigned=new Set<string>();const usedNodes=new Set<string>();
 const leaf=(path:string):WorkspaceEntry=>({id:path,title:byPath.get(path)?.title||path.split('/').pop()!.replace(/\.tex$/,''),kind:'document',children:[]});
 function branch(n:KnowledgeNode,ancestors=new Set<string>()):WorkspaceEntry|null{
  if(ancestors.has(n.id))return null;usedNodes.add(n.id);const next=new Set(ancestors).add(n.id);const children:WorkspaceEntry[]=[];
  if(n.kind==='dashboard')for(const path of n.targets){const child=byId.get(path);if(child){const entry=branch(child,next);if(entry)children.push(entry);}else if(allowed.has(path)){assigned.add(path);children.push(leaf(path));}}
  return {id:n.id,title:n.title,kind:n.kind,level:n.level,children};
 }
 const roots=nodes.filter(n=>n.level==='root');const tree:WorkspaceEntry[]=roots.map(n=>branch(n)!).filter(Boolean);
 for(const n of nodes)if(!usedNodes.has(n.id)&&!n.parent){const entry=branch(n);if(entry)(tree[0]?.children||tree).push(entry);}
 // Standalone guides join the section whose existing note paths best match their directory.
 const sections:WorkspaceEntry[]=[];function collect(items:WorkspaceEntry[]){for(const e of items){if(e.level==='section')sections.push(e);collect(e.children);}}collect(tree);
 for(const path of files)if(!assigned.has(path)){
  const folder=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';
  const best=folder?sections.map(e=>({e,count:e.children.filter(c=>c.kind==='document'&&c.id.startsWith(folder)).length})).sort((a,b)=>b.count-a.count)[0]:undefined;
  if(best&&best.count>0){best.e.children.push(leaf(path));assigned.add(path);}else if(roots.length&&(path==='overview.tex'||path==='combined-notes.tex')){tree[0].children.push(leaf(path));assigned.add(path);}
 }
 // Files without a concept placement keep their actual folder paths in this same tree.
 for(const path of files)if(!assigned.has(path)){
  let children=tree;let folder='';const parts=path.split('/');for(const name of parts.slice(0,-1)){folder+=(folder?'/':'')+name;const id='folder:'+folder;let entry=children.find(e=>e.id===id);if(!entry){entry={id,title:name,kind:'folder',children:[]};children.push(entry);}children=entry.children;}children.push(leaf(path));
 }
 function filter(items:WorkspaceEntry[]):WorkspaceEntry[]{return items.flatMap(e=>{const children=filter(e.children);return !query||e.title.toLowerCase().includes(query.toLowerCase())||e.id.toLowerCase().includes(query.toLowerCase())?[e]:children.length?[{...e,children}]:[];});}
 return filter(tree);
}
