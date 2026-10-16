export type Tool='latex'|'agent'|'graph';
export type PanelMode='read'|'write'|'graph';
export const toolNames:Record<Tool,string>={latex:'LaTeX',agent:'Agent',graph:'Graph'};
export function restoreTools(value:string|null):Tool[]{
 try{const tools=JSON.parse(value||'null');if(Array.isArray(tools)&&tools.length<=3&&new Set(tools).size===tools.length&&tools.every(t=>['latex','agent','graph'].includes(t)))return tools;}catch{/* Recover invalid preferences. */}
 return ['latex','graph'];
}
export function addTool(tools:Tool[],tool:Tool):Tool[]{return tools.includes(tool)||tools.length===3?tools:[...tools,tool];}
