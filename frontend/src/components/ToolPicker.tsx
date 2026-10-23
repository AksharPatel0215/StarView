import useDialog from './useDialog';
import {toolNames} from '../panelLayout';
import type {Tool} from '../panelLayout';
export default function ToolPicker({tools,onAdd,onClose}:{tools:Tool[];onAdd:(tool:Tool)=>void;onClose:()=>void}){
 const ref=useDialog(onClose);
 return <div className="tool-picker-backdrop" onClick={onClose}><section ref={ref} className="tool-picker" role="dialog" aria-modal="true" aria-label="Add tool" onClick={e=>e.stopPropagation()}><header><h2>Add tool</h2><button aria-label="Close tool picker" onClick={onClose}>×</button></header>{(['latex','agent','graph'] as const).filter(tool=>!tools.includes(tool)).map(tool=><button key={tool} onClick={()=>onAdd(tool)}><strong>{toolNames[tool]}</strong><span>{tool==='latex'?'Notes, dashboards, and flashcards':tool==='agent'?'Ask, draft, and review changes':'Explore how ideas connect'}</span></button>)}</section></div>;
}
