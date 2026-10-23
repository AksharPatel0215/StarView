import type {DocumentNode,WorkspaceNode} from './api/client';
export type KnowledgeNode = WorkspaceNode & {level?:'root'|'topic'|'section';description?:string;parent?:string;roles?:Record<string,string>;trail?:string[]};
export function hierarchyNotes(node:KnowledgeNode,nodes:KnowledgeNode[],documents:DocumentNode[],seen=new Set<string>(),paths=new Set<string>()){
 if(seen.has(node.id))return paths;seen.add(node.id);
 const byId=new Map(nodes.map(n=>[n.id,n]));const byPath=new Map(documents.filter(d=>!d.kind||d.kind==='document').map(d=>[d.path,d]));
 for(const t of node.targets){const child=byId.get(t);if(child)hierarchyNotes(child,nodes,documents,seen,paths);else if(byPath.has(t))paths.add(t);}return paths;
}
export function hierarchyMatches(node:KnowledgeNode,nodes:KnowledgeNode[],documents:DocumentNode[],search:string,seen=new Set<string>()):boolean{
 if(seen.has(node.id))return false;seen.add(node.id);
 const byId=new Map(nodes.map(n=>[n.id,n]));const byPath=new Map(documents.map(d=>[d.path,d]));
 return `${node.title} ${node.description||''}`.toLowerCase().includes(search)||node.targets.some(t=>{const child=byId.get(t);return child?hierarchyMatches(child,nodes,documents,search,seen):byPath.get(t)?.title.toLowerCase().includes(search);});
}
