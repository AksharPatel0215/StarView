import type {DocumentLink} from './api/client';
export function foregroundRelationship(edge:{source:string;target:string},foreground:Set<string>,candidates:Set<string>,anchor:string):boolean{
 if(foreground.has(edge.source)&&foreground.has(edge.target))return true;
 return Boolean(anchor)&&((edge.source===anchor&&candidates.has(edge.target))||(edge.target===anchor&&candidates.has(edge.source)));
}

export function uniqueRelationships(edges:readonly DocumentLink[]):(DocumentLink&{reciprocal:boolean})[]{
 const result=new Map<string,DocumentLink&{reciprocal:boolean}>();
 for(const edge of edges){
  if(edge.missing)continue;
  const key=JSON.stringify([edge.source,edge.target].sort());const existing=result.get(key);
  if(!existing){result.set(key,{...edge,labels:[...(edge.labels||[])],reciprocal:false});continue;}
  existing.reciprocal ||= existing.source===edge.target&&existing.target===edge.source;
  existing.labels=[...new Set([...(existing.labels||[]),...(edge.labels||[])])];
  if(edge.provisional){existing.provisional=true;existing.draft_action=edge.draft_action;}
 }
 return [...result.values()];
}
