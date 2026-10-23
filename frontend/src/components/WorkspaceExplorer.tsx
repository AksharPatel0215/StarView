import {workspaceTree} from '../workspaceTree';
import type {WorkspaceEntry} from '../workspaceTree';
import type {KnowledgeNode} from '../knowledgeHierarchy';
import type {DocumentNode} from '../api/client';
import FileTree from './FileTree';
import './workspace-explorer.css';
export default function WorkspaceExplorer({nodes,files,documents,selected,query,onOpen,onAction,onMove,disabled}:{nodes:KnowledgeNode[];files:string[];documents:DocumentNode[];selected:string;query:string;onOpen:(path:string)=>void;onAction:(path:string,mode:'move'|'delete')=>void;onMove:(path:string,folder:string)=>void;disabled?:boolean}){
 const entries=workspaceTree(nodes,files,documents,query);
 function render(items:WorkspaceEntry[]):React.ReactNode{return <ul className="workspace-tree">{items.map(e=><li key={e.id}>{e.kind==='document'?<FileTree files={[e.id]} flat labels={{[e.id]:e.title}} selectedFile={selected} onFileSelect={onOpen} onAction={onAction} onMove={onMove} disabled={disabled}/>:e.kind==='dashboard'||e.kind==='folder'?<details open={!!query||e.level==='root'||e.kind==='folder'}><summary className={selected===e.id?'active':''}>{e.kind==='dashboard'?<button disabled={disabled} title={e.title} onClick={event=>{event.preventDefault();event.stopPropagation();onOpen(e.id);}}>{e.title}</button>:<span>{e.title}</span>}</summary>{render(e.children)}</details>:<button className={'workspace-object '+(selected===e.id?'active':'')} title={e.kind==='flashcards'?'Flashcards: '+e.title:e.title} disabled={disabled} onClick={()=>onOpen(e.id)}>{e.title}</button>}</li>)}</ul>;}
 return <nav className="workspace-explorer" aria-label="Workspace files">{render(entries)}{!entries.length&&<p className="empty-documents">No matching items.</p>}</nav>;
}
