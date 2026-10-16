import { useEffect, useState } from 'react';
import { getStats } from '../api/client';
import type { WorkspaceNode, WorkspaceStats, DocumentNode } from '../api/client';
import { dashboardSections } from '../dashboardSections';
export default function Dashboard({project,node,onOpen,refresh,resources,documents}:{project:string;node?:WorkspaceNode|null;onOpen:(path:string)=>void;refresh:number;resources:DocumentNode[];documents:DocumentNode[]}) {
  const [stats,setStats]=useState<WorkspaceStats|null>(null);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  useEffect(()=>{let active=true;setStats(null);setError('');getStats(project,node?.id).then(value=>{if(active)setStats(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[project,node?.id,node?.targets,refresh]);
  const sections=dashboardSections(documents,node?.targets);
  const search=query.trim().toLowerCase();
  const visible=sections.filter(section=>`${section.guide.title} ${section.notes.map(note=>note.title).join(' ')}`.toLowerCase().includes(search));
  const looseTargets=node?documents.filter(doc=>node.targets.includes(doc.path)&&!doc.path.endsWith('/index.tex')&&(!doc.kind||doc.kind==='document')):[];
  return <div className="dashboard course-dashboard">
    <span className="eyebrow">{node?'Course dashboard':'Workspace overview'}</span>
    <h1>{node?.title||project}</h1>
    <p className="dashboard-subtitle">Choose a section to read its guide, or expand it to jump directly to a note.</p>
    <div className="course-navigation"><h2>Explore sections <span>{sections.length}</span></h2><input type="search" aria-label="Find a section or note" placeholder="Find a section or note…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    <div className="course-sections">{visible.map(({guide,notes})=>{
      const guideMatches=guide.title.toLowerCase().includes(search);
      const listed=search&&!guideMatches?notes.filter(note=>note.title.toLowerCase().includes(search)):notes;
      return <article className="course-section" key={guide.path}>
        <div className="course-section-heading"><span className="course-number">{String(sections.findIndex(section=>section.guide.path===guide.path)+1).padStart(2,'0')}</span><span>{notes.length} {notes.length===1?'note':'notes'}</span></div>
        <h3>{guide.title}</h3>
        <p>{notes.slice(0,3).map(note=>note.title).join(' · ')}{notes.length>3?' · …':''}</p>
        <button className="section-open" onClick={()=>onOpen(guide.path)}>Open {guide.title} guide <span aria-hidden="true">↗</span></button>
        {notes.length>0&&<details key={search?'search':'browse'} open={search?true:undefined}><summary>Browse {listed.length} {listed.length===1?'note':'notes'}</summary><div className="section-notes">{listed.map(note=><button key={note.path} onClick={()=>onOpen(note.path)}>{note.title}<span aria-hidden="true">→</span></button>)}</div></details>}
      </article>;
    })}</div>
    {!visible.length&&<p role="status">{search?'No matching sections or notes.':'No section guides are connected yet. Use Edit node & connections to add them.'}</p>}
    {looseTargets.length>0&&<section className="dashboard-card"><h2>Connected notes</h2>{looseTargets.map(note=><button className="hub-row" key={note.path} onClick={()=>onOpen(note.path)}>{note.title}</button>)}</section>}
    {resources.length>0&&<section className="dashboard-card resource-cards"><h2>Connected resources</h2><div>{resources.map(resource=><button key={resource.path} onClick={()=>onOpen(resource.path)}>{resource.title}</button>)}</div></section>}
    <details className="course-statistics"><summary>Workspace statistics</summary>{error?<p className="error" role="alert">{error}</p>:!stats?<p role="status">Gathering your workspace…</p>:<><div className="stat-grid">{[['Sections',sections.length],['Notes',sections.reduce((sum,section)=>sum+section.notes.length,0)],['Connections',stats.connections],['Unresolved links',stats.unresolved]].map(([label,value])=><article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><p className="dashboard-note">Section notes are grouped by folder. Connection statistics cover {node?'this dashboard’s direct targets':'the workspace'}.</p></>}</details>
  </div>;
}
