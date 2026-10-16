import type {DocumentNode} from './api/client';
export function dashboardSections(documents:DocumentNode[],targets?:string[]) {
 const notes=documents.filter(doc=>!doc.kind || doc.kind==='document');
 const allowed=targets?new Set(targets):null;
 const guides=notes.filter(doc=>doc.path.endsWith('/index.tex')&&(!allowed||allowed.has(doc.path)));
 const ordered=targets?guides.sort((a,b)=>targets.indexOf(a.path)-targets.indexOf(b.path)):guides;
 return ordered.map(guide=>{
  const folder=guide.path.slice(0,guide.path.lastIndexOf('/')+1);
  return {guide,notes:notes.filter(doc=>doc.path.startsWith(folder)&&doc.path!==guide.path).sort((a,b)=>a.title.localeCompare(b.title))};
 });
}
