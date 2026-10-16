import {useRef} from 'react';
export default function ToolDivider({left,right,onChange}:{left:number;right:number;onChange:(left:number,right:number)=>void}){
 const start=useRef<{x:number;left:number;sum:number;pixels:number}|null>(null);
 function adjust(value:number,sum=left+right){const next=Math.max(sum*.25,Math.min(sum*.75,value));onChange(next,sum-next);}
 return <div className="resize-handle tool-divider" role="separator" tabIndex={0} aria-label="Resize tools" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(100*left/(left+right))}
 onPointerDown={e=>{if(e.button!==0)return;const before=e.currentTarget.previousElementSibling,after=e.currentTarget.nextElementSibling;if(!before||!after)return;start.current={x:e.clientX,left,sum:left+right,pixels:before.getBoundingClientRect().width+after.getBoundingClientRect().width};e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{const s=start.current;if(s)adjust(s.left+(e.clientX-s.x)*s.sum/s.pixels,s.sum);}}
 onPointerUp={e=>{start.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{start.current=null;}}
 onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();adjust(left+(left+right)*.025*(e.key==='ArrowRight'?1:-1));}}}><span/></div>;
}
