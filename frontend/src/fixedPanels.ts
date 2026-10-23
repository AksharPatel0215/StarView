import type {Tool} from './panelLayout';
export type PanelRect={x:number;y:number;width:number;height:number};
export const GAP=6;
export const DEFAULT_SPLITS={columns:.55,rows:.68};
export function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
export function restoreSplits(value:string|null){
 try{const v=JSON.parse(value||'{}');return {columns:Number.isFinite(v.columns)?clamp(v.columns,.3,.7):DEFAULT_SPLITS.columns,rows:Number.isFinite(v.rows)?clamp(v.rows,.25,.7):DEFAULT_SPLITS.rows};}catch{return {...DEFAULT_SPLITS};}
}
export function fixedGeometry(tools:readonly Tool[],viewport:{width:number;height:number},splits=DEFAULT_SPLITS){
 const notes=tools.includes('latex'),graph=tools.includes('graph'),agent=tools.includes('agent'),right=graph||agent;
 const width=Math.max(viewport.width,notes&&right?746:right?400:340);
 const height=Math.max(viewport.height,graph&&agent?586:agent?260:300);
 const windows:Partial<Record<Tool,PanelRect>>={};
 const bars:{id:'columns'|'rows';axis:'x'|'y';rect:PanelRect;space:number;ratio:number;min:number;max:number;defaultRatio:number}[]=[];
 let rightX=0,rightWidth=width;
 if(notes&&right){
  const space=width-GAP,min=Math.max(.3,340/space),max=Math.min(.7,1-400/space),ratio=clamp(splits.columns,min,max),leftWidth=space*ratio;
  windows.latex={x:0,y:0,width:leftWidth,height};rightX=leftWidth+GAP;rightWidth=space-leftWidth;
  bars.push({id:'columns',axis:'x',rect:{x:leftWidth,y:0,width:GAP,height},space,ratio,min,max,defaultRatio:DEFAULT_SPLITS.columns});
 }else if(notes)windows.latex={x:0,y:0,width,height};
 if(graph&&agent){
  const space=height-GAP,min=Math.max(.25,320/space),max=Math.min(.7,1-260/space),ratio=clamp(splits.rows,min,max),topHeight=space*ratio;
  windows.graph={x:rightX,y:0,width:rightWidth,height:topHeight};
  windows.agent={x:rightX,y:topHeight+GAP,width:rightWidth,height:space-topHeight};
  bars.push({id:'rows',axis:'y',rect:{x:rightX,y:topHeight,width:rightWidth,height:GAP},space,ratio,min,max,defaultRatio:DEFAULT_SPLITS.rows});
 }else if(right)windows[graph?'graph':'agent']={x:rightX,y:0,width:rightWidth,height};
 return {width,height,windows,bars};
}
