import {useState} from 'react';
import type {DocumentNode} from '../api/client';
import {hierarchyMatches,hierarchyNotes} from '../knowledgeHierarchy';
import type {KnowledgeNode} from '../knowledgeHierarchy';
import './knowledge-dashboard.css';

const roles=[['idea','Ideas and definitions'],['theorem','Theorems and proofs'],['method','Methods and derivations'],['example','Examples'],['guide','Section guides']];
export default function KnowledgeDashboard({node,nodes,documents,onOpen}:{node:KnowledgeNode;nodes:KnowledgeNode[];documents:DocumentNode[];onOpen:(path:string)=>void}){
 const [query,setQuery]=useState('');
 const byId=new Map(nodes.map(n=>[n.id,n]));const byPath=new Map(documents.map(d=>[d.path,d]));
 const ancestors:KnowledgeNode[]=[];const seen=new Set([node.id]);let parent=node.parent?byId.get(node.parent):undefined;
 while(parent&&!seen.has(parent.id)){seen.add(parent.id);ancestors.unshift(parent);parent=parent.parent?byId.get(parent.parent):undefined;}
 const search=query.trim().toLowerCase();
 const matches=(n:KnowledgeNode)=>hierarchyMatches(n,nodes,documents,search);
 const count=(n:KnowledgeNode)=>hierarchyNotes(n,nodes,documents);
 const children=node.targets.map(t=>byId.get(t)).filter((n):n is KnowledgeNode=>!!n&&n.kind==='dashboard');
 const notes=node.targets.map(t=>byPath.get(t)).filter((n):n is DocumentNode=>!!n&&(!n.kind||n.kind==='document'));
 const visible=notes.filter(n=>`${n.title} ${n.tags.join(' ')}`.toLowerCase().includes(search));
 const classified=visible.map(note=>({note,role:node.roles?.[note.path]||'idea'}));
 const related=nodes.filter(n=>n.level==='section'&&n.id!==node.id&&n.targets.some(t=>node.targets.includes(t)&&!t.endsWith('/index.tex')));
 return <div className="dashboard knowledge-dashboard">
  <nav aria-label="Mathematics hierarchy" className="knowledge-breadcrumb">{ancestors.map(n=><span key={n.id}><button onClick={()=>onOpen(n.id)}>{n.title}</button><span aria-hidden="true"> / </span></span>)}<span aria-current="page">{node.title}</span></nav>
  <span className="eyebrow">{node.level==='root'?'Knowledge map':node.level==='topic'?'Topic':'Section'}</span>
  <h1>{node.title}</h1><p className="dashboard-subtitle">{node.description}</p>
  {node.level==='root'&&<p className="knowledge-levels">Topics <span>→</span> Sections <span>→</span> Ideas · Theorems · Methods · Examples</p>}
  <label className="knowledge-search">Search {node.level==='root'?'all topics':'this '+node.level}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find an idea, theorem, or example…"/></label>
  {children.length>0&&<section><h2>{node.level==='root'?'Topics':'Sections'}</h2><div className="knowledge-cards">{children.filter(n=>!search||matches(n)).map(n=><button className="knowledge-card" key={n.id} onClick={()=>onOpen(n.id)}><span className="eyebrow">{n.level==='topic'?'Topic':'Section'} · {count(n).size} notes</span><strong>{n.title}<span aria-hidden="true"> ↗</span></strong><span>{n.description}</span>{n.level==='topic'&&<small>{n.targets.map(t=>byId.get(t)?.title).filter(Boolean).join(' · ')}</small>}</button>)}</div>{search&&!children.some(n=>matches(n))&&<p role="status">No matching topics or sections.</p>}</section>}
  {node.trail&&node.trail.length>0&&<section className="knowledge-trail"><h2>How the ideas build</h2><ol>{node.trail.map(t=><li key={t}><button onClick={()=>onOpen(t)}>{byPath.get(t)?.title||t}</button></li>)}</ol></section>}
  {roles.map(([role,label])=>{const group=classified.filter(n=>n.role===role);return group.length>0&&<section key={role} className="knowledge-group"><h2>{label}<small>{group.length}</small></h2>{group.map(({note})=><button className="hub-row" key={note.path} onClick={()=>onOpen(note.path)}><span>{note.title}</span><span aria-hidden="true">↗</span></button>)}</section>;})}
  {notes.length>0&&visible.length===0&&<p role="status">No matching notes in this section.</p>}
  {node.level==='section'&&related.length>0&&<section className="knowledge-related"><h2>Connected sections</h2><p>These sections share ideas, results, or examples with this one.</p>{related.map(n=><button key={n.id} onClick={()=>onOpen(n.id)}>{n.title} ↗</button>)}</section>}
 </div>;
}
