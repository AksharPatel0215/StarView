import type {AgentProposal,AgentReply,KnowledgeGraph} from './api/client';
export type AgentScene={paths:string[];proposal:AgentProposal|null;exactPath?:boolean};
export function responsePaths(prompt:string,reply:AgentReply,graph:KnowledgeGraph){
 if(reply.concept_path)return reply.concept_path.paths.filter(path=>graph.documents.some(d=>d.path===path));
 const known=new Set(graph.documents.map(d=>d.path));
 const explicit=graph.documents.filter(d=>prompt.includes(d.path)||(d.title.length>4&&prompt.toLowerCase().includes(d.title.toLowerCase()))).map(d=>d.path);
 return [...new Set([...explicit,...(reply.sources||[]).map(source=>source.path),...reply.citations])].filter(path=>known.has(path)).slice(0,12);
}
export function sceneGraph(graph:KnowledgeGraph,scene:AgentScene):KnowledgeGraph&{focusPaths:string[]}{
 const documents=graph.documents.map(d=>({...d})),links=graph.links.map(e=>({...e}));
 const paths=new Set(scene.paths.filter(p=>documents.some(d=>d.path===p)));
 for(const change of scene.proposal?.changes||[]){
  if(change.kind==='create_note'||change.kind==='update_note'){
   let node=documents.find(d=>d.path===change.path);
   if(!node){node={path:change.path,title:change.content.match(/\\title\{([^}]+)\}/)?.[1]||change.path.split('/').pop()||change.path,tags:[],is_main:false,kind:'document'};documents.push(node);}
   node.provisional=true;paths.add(change.path);
  }
 }
 for(const change of scene.proposal?.changes||[]){
  if(!['connect','disconnect','label_connection'].includes(change.kind))continue;
  if(!documents.some(d=>d.path===change.source)||!documents.some(d=>d.path===change.target))continue;
  paths.add(change.source);paths.add(change.target);
  const edge=links.find(e=>e.source===change.source&&e.target===change.target);
  if(edge){edge.provisional=true;edge.draft_action=change.kind;if(change.kind==='label_connection')edge.labels=change.labels;}
  else if(change.kind==='connect')links.push({source:change.source,target:change.target,missing:false,labels:change.labels,provisional:true,draft_action:change.kind});
 }
 // Include shortest existing paths between cited concepts, without inventing edges.
 const anchors=scene.exactPath?[]:[...paths],allowed=new Set(documents.filter(d=>(!d.kind||d.kind==='document')&&!['index','overview','main'].includes(d.path.split('/').pop()?.replace(/\.tex$/,'')||'')&&!d.tags.some(tag=>['section','workspace','overview'].includes(tag))).map(d=>d.path));
 for(let i=0;i<anchors.length;i++)for(let j=i+1;j<anchors.length;j++){
  const queue=[anchors[i]],previous=new Map<string,string|null>([[anchors[i],null]]);
  for(let k=0;k<queue.length&&!previous.has(anchors[j]);k++){
   for(const edge of links){if(edge.missing||edge.draft_action==='disconnect')continue;const next=edge.source===queue[k]?edge.target:edge.target===queue[k]?edge.source:'';
    if(allowed.has(queue[k])&&next&&allowed.has(next)&&!previous.has(next)){previous.set(next,queue[k]);queue.push(next);}
   }
  }
  if(previous.has(anchors[j])){let p:string|null=anchors[j];while(p){paths.add(p);p=previous.get(p)||null;}}
 }
 if(!scene.exactPath&&paths.size===1){const anchor=[...paths][0];for(const edge of links)if(!edge.missing&&(edge.source===anchor||edge.target===anchor)){paths.add(edge.source);paths.add(edge.target);}}
 return {...graph,documents,links,focusPaths:[...paths]};
}
