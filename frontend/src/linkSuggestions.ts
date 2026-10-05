import { wikiLinks } from './documentLinks';
export type LinkDocument={path:string;title:string;kind?:string};
export function linkContext(content:string,offset:number) {
  const start=content.lastIndexOf('[[',offset-1);
  if(start<0)return null;
  const query=content.slice(start+2,offset);
  if(/[[\]\n|]/.test(query))return null;
  // Use the existing parser to exclude comments, verbatim, and inline verb.
  const probe=content.slice(0,start)+'[[starview-probe]]'+content.slice(offset);
  if(!wikiLinks(probe).some(link=>link.start===start))return null;
  const tail=content.slice(offset).split('\n')[0];const closing=tail.indexOf(']]');
  const end=closing>=0&&!/[[\]]/.test(tail.slice(0,closing))?offset+closing+2:offset;
  return {start:start+2,end,query:query.trim().toLowerCase()};
}
export function relativeLink(source:string,target:string) {
  const from=source.split('/').slice(0,-1),to=target.replace(/\.tex$/i,'').split('/');
  while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift();}
  return [...from.map(()=>'..'),...to].join('/');
}
export function linkSuggestions(documents:LinkDocument[],source:string,query:string) {
  return documents.filter(doc=>/\.tex$/i.test(doc.path)&&(!doc.kind||doc.kind==='document')&&doc.path!==source&&`${doc.title} ${doc.path}`.toLowerCase().includes(query)).map(doc=>{
    const label=doc.title.replace(/[[\]|\r\n]/g,' ').trim()||doc.path.split('/').pop()!.slice(0,-4);
    return {...doc,insertText:`${relativeLink(source,doc.path)}|${label}]]`};
  }).sort((a,b)=>a.title.localeCompare(b.title)||a.path.localeCompare(b.path));
}
