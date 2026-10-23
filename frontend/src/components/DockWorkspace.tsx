import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import type {Tool} from '../panelLayout';
import {toolNames} from '../panelLayout';
import {clamp,DEFAULT_SPLITS,fixedGeometry,restoreSplits} from '../fixedPanels';
import type {PanelRect} from '../fixedPanels';
import NavIcon from './NavIcon';

type Props={tools:Tool[];focused:Tool|null;onFocus:(tool:Tool|null)=>void;onClose:(tool:Tool)=>void;render:(tool:Tool)=>ReactNode;controls:(tool:Tool)=>ReactNode;empty:ReactNode;resetVersion:number};
const box=(r:PanelRect)=>({left:r.x,top:r.y,width:r.width,height:r.height});
export default function DockWorkspace({tools,focused,onFocus,onClose,render,controls,empty,resetVersion}:Props){
 const [splits,setSplits]=useState(()=>restoreSplits(localStorage.getItem('starview-graph-room-splits')));
 const [size,setSize]=useState({width:1000,height:760});
 const scroll=useRef<HTMLDivElement>(null),reset=useRef(resetVersion);
 const resize=useRef<{id:'columns'|'rows';axis:'x'|'y';start:number;ratio:number;space:number;min:number;max:number}|null>(null);
 const [resizing,setResizing]=useState(false);
 useEffect(()=>{localStorage.setItem('starview-graph-room-splits',JSON.stringify(splits));localStorage.setItem('starview-fixed-layout','1');},[splits]);
 useEffect(()=>{if(reset.current!==resetVersion){reset.current=resetVersion;setSplits({...DEFAULT_SPLITS});}},[resetVersion]);
 useEffect(()=>{const element=scroll.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(element);return()=>observer.disconnect();},[]);
 const geometry=fixedGeometry(focused?[focused]:tools,size,splits);
 return <div ref={scroll} className={`dock-scroll fixed-panels${resizing?' is-resizing':''}`}>
  <div className="dock-surface" style={{width:geometry.width,height:geometry.height}}>
   {tools.map(tool=>{const rect=geometry.windows[tool];return <section key={tool} data-dock-tool={tool} className="tool-window dock-window" aria-label={`${toolNames[tool]} tool`} style={rect?box(rect):{display:'none'}}>
    <header className="tool-header"><span className="tool-title fixed-tool-title"><NavIcon name={tool==='latex'?'page':tool}/><strong>{toolNames[tool]}</strong></span>{controls(tool)}<div className="tool-header-actions">
     <button className="nav-icon-button" title={focused===tool?'Restore layout':'Focus this window'} aria-label={focused===tool?'Restore layout':`Focus ${toolNames[tool]} window`} onClick={()=>onFocus(focused===tool?null:tool)}><NavIcon name={focused===tool?'restore':'focus'}/></button>
     <button className="nav-icon-button dock-close" aria-label={`Close ${toolNames[tool]} window`} title={`Close ${toolNames[tool]} window`} onClick={()=>onClose(tool)}><NavIcon name="close"/></button>
    </div></header>{render(tool)}
   </section>;})}
   {geometry.bars.map(bar=><div key={bar.id} className={`dock-divider dock-divider-${bar.axis}`} style={box(bar.rect)} role="separator" tabIndex={0} title="Drag to resize · double-click to reset" aria-label={bar.id==='columns'?'Resize Notes and right panels':'Resize Graph and Agent'} aria-orientation={bar.axis==='x'?'vertical':'horizontal'} aria-valuenow={Math.round(bar.ratio*100)} aria-valuemin={Math.ceil(bar.min*100)} aria-valuemax={Math.floor(bar.max*100)}
    onDoubleClick={()=>setSplits(previous=>({...previous,[bar.id]:clamp(bar.defaultRatio,bar.min,bar.max)}))}
    onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);resize.current={id:bar.id,axis:bar.axis,start:bar.axis==='x'?event.clientX:event.clientY,ratio:bar.ratio,space:bar.space,min:bar.min,max:bar.max};setResizing(true);}}
    onPointerMove={event=>{const active=resize.current;if(!active)return;const coordinate=active.axis==='x'?event.clientX:event.clientY;setSplits(previous=>({...previous,[active.id]:clamp(active.ratio+(coordinate-active.start)/active.space,active.min,active.max)}));}}
    onPointerUp={()=>{resize.current=null;setResizing(false);}} onPointerCancel={()=>{resize.current=null;setResizing(false);}} onLostPointerCapture={()=>{resize.current=null;setResizing(false);}}
    onKeyDown={event=>{const decrease=bar.axis==='x'?'ArrowLeft':'ArrowUp',increase=bar.axis==='x'?'ArrowRight':'ArrowDown';if(![decrease,increase,'Home','End'].includes(event.key))return;event.preventDefault();const value=event.key==='Home'?bar.min:event.key==='End'?bar.max:bar.ratio+(event.key===decrease?-.03:.03);setSplits(previous=>({...previous,[bar.id]:clamp(value,bar.min,bar.max)}));}}
   ><span/></div>)}
   {!tools.length&&empty}
  </div>
 </div>;
}
