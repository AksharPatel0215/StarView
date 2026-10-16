import type {DocumentNode} from './api/client';
export type NodeRole='workspace'|'section'|'note';
export type NodeMode='background'|'preview'|'foreground';
export function nodeRole(node:Pick<DocumentNode,'path'|'tags'|'kind'>):NodeRole {
 const override=node.tags.map(tag=>tag.toLowerCase().trim()).find(tag=>['workspace','section','note'].includes(tag));
 if(override)return override as NodeRole;
 if(node.kind==='dashboard')return 'workspace';
 if(node.path.endsWith('/index.tex')||node.tags.includes('overview'))return 'section';
 return 'note';
}
const ranges:Record<NodeMode,Record<NodeRole,[number,number]>>={
 background:{workspace:[8,10],section:[5,7],note:[2.5,4.5]},
 preview:{workspace:[13,16],section:[8,11],note:[5,7]},
 foreground:{workspace:[20,24],section:[14,18],note:[8,12]},
};
export function nodeRadius(node:Pick<DocumentNode,'path'|'tags'|'kind'>,connections:number,mode:NodeMode){
 const [low,high]=ranges[mode][nodeRole(node)];
 const importance=Math.min(1,Math.log2(1+Math.max(0,connections))/6);
 return low+(high-low)*importance;
}
function random(seed:string){let value=2166136261;for(const char of seed)value=Math.imul(value^char.charCodeAt(0),16777619);value^=value>>>16;value=Math.imul(value,2246822507);value^=value>>>13;return (value>>>0)/4294967296;}
export function pulseProfile(path:string,connections:number){
 const importance=Math.min(1,Math.log2(1+Math.max(0,connections))/6);
 return {low:.72+random(path+'low')*.18,high:1.12+random(path+'high')*.2+importance*.08,duration:3.8+random(path+'time')*5.2,delay:-random(path+'delay')*12};
}