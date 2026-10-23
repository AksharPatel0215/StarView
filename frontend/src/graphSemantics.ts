import type {DocumentNode,DocumentLink,KnowledgeGraph} from './api/client';
export const graphKinds=['workspace','topic','section','idea','theorem','method','example','flashcards','data'] as const;
export type GraphKind=typeof graphKinds[number];
export function graphKind(node:Pick<DocumentNode,'path'|'kind'|'tags'>):GraphKind{
 const explicit=node.tags.find(t=>t.startsWith('graph-role:'))?.slice(11);
 if(graphKinds.includes(explicit as GraphKind))return explicit as GraphKind;
 if(node.kind==='flashcards'||node.kind==='data')return node.kind;
 if(node.kind==='dashboard')return 'workspace';
 if(node.path.endsWith('/index.tex')||node.tags.includes('overview'))return 'section';
 return 'idea';
}
export function graphShape(kind:GraphKind,r:number):string{
 const polygon=(n:number,angle=-Math.PI/2)=>Array.from({length:n},(_,i)=>`${i?'L':'M'}${Math.cos(angle+i*2*Math.PI/n)*r},${Math.sin(angle+i*2*Math.PI/n)*r}`).join(' ')+' Z';
 if(kind==='topic')return polygon(6);
 if(kind==='theorem')return polygon(4);
 if(kind==='method')return polygon(3);
 if(kind==='example')return polygon(5);
 if(kind==='section')return `M${-r*.8},${-r*.7} H${r*.8} Q${r},${-r*.7} ${r},${-r*.5} V${r*.5} Q${r},${r*.7} ${r*.8},${r*.7} H${-r*.8} Q${-r},${r*.7} ${-r},${r*.5} V${-r*.5} Q${-r},${-r*.7} ${-r*.8},${-r*.7} Z`;
 if(kind==='flashcards')return `M${-r*.8},${-r*.8} H${r*.5} V${r*.5} H${-r*.8} Z M${-r*.5},${-r*.5} H${r*.8} V${r*.8} H${-r*.5} Z`;
 if(kind==='data')return `M${-r},${-r*.6} C${-r},${-r} ${r},${-r} ${r},${-r*.6} V${r*.6} C${r},${r} ${-r},${r} ${-r},${r*.6} Z M${-r},${-r*.6} C${-r},${-r*.2} ${r},${-r*.2} ${r},${-r*.6}`;
 const circle=`M${-r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 ${-r*2},0`;
 return circle;
}
export function graphDepth(path:string,selected:string,foreground:Set<string>,preview:Set<string>){return path===selected?3:foreground.has(path)?2:preview.has(path)?1:0;}
export function relationshipDash(link:DocumentLink){
 const labels=link.labels?.join(' ').toLowerCase()||'';
 if(/derive|proof|prerequisite|leads to|generaliz/.test(labels))return '5 3';
 if(/illustrat|example|practic/.test(labels))return '1 3';
 return undefined;
}

/** Topic-map guides stay editable but do not duplicate content in the graph. */
export function graphForDisplay(graph:KnowledgeGraph):KnowledgeGraph{
 const hidden=new Set(graph.documents.filter(node=>/\btopic\s+maps?\b/i.test(node.title)).map(node=>node.path));
 return {...graph,documents:graph.documents.filter(node=>!hidden.has(node.path)),links:graph.links.filter(link=>!hidden.has(link.source)&&!hidden.has(link.target))};
}
