import { useRef } from 'react';
export default function ResizeHandle({ label, value, min, max, reverse = false, onChange }: {label:string;value:number;min:number;max:number;reverse?:boolean;onChange:(value:number)=>void}) {
  const start = useRef<{x:number; value:number}|null>(null);
  const clamp = (next:number)=>Math.max(min,Math.min(max,next));
  return <div className="resize-handle" role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onChange(clamp(value+(e.key==='ArrowRight'?20:-20)*(reverse?-1:1)));}}} onPointerDown={e=>{if(e.button!==0)return;start.current={x:e.clientX,value};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(start.current)onChange(clamp(start.current.value+(e.clientX-start.current.x)*(reverse?-1:1)));}} onPointerUp={e=>{start.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{start.current=null;}}><span/></div>;
}
