import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
type Props={flat?:boolean;labels?:Record<string,string>;files:string[];selectedFile?:string;onFileSelect:(file:string)=>void;onAction?:(file:string,mode:'move'|'delete')=>void;onMove?:(file:string,folder:string)=>void;disabled?:boolean};
type Node={name:string;path:string;children:Node[];isFile:boolean};
function build(files:string[]){const root:Node[]=[];for(const file of files){let children=root,path='';file.split('/').forEach((name,index,parts)=>{path=path?`${path}/${name}`:name;let node=children.find(item=>item.name===name);if(!node){node={name,path,children:[],isFile:index===parts.length-1};children.push(node);}children=node.children;});}return root;}
export default function FileTree(props:Props){
 const [actions,setActions]=useState<{path:string;x:number;y:number}|null>(null),[drop,setDrop]=useState('');
 const menu=useRef<HTMLDivElement>(null),trigger=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  if(!actions)return;
  menu.current?.querySelector('button')?.focus();
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as globalThis.Node))setActions(null);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setActions(null);trigger.current?.focus();}};
  const close=()=>setActions(null);
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',close);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',close);};
 },[actions]);
 function openActions(path:string,element:HTMLElement,x?:number,y?:number){
  if(props.disabled||!props.onAction)return;
  trigger.current=element;const r=element.getBoundingClientRect();
  setActions({path,x:Math.max(8,Math.min(x??r.right-180,window.innerWidth-198)),y:Math.max(8,Math.min(y??r.bottom+4,window.innerHeight-116))});
 }
 function branch(nodes:Node[]){return <ul className="file-tree">{[...nodes].sort((a,b)=>Number(a.isFile)-Number(b.isFile)||a.name.localeCompare(b.name)).map(node=><li key={node.path}>{node.isFile?<div className={`file-entry${props.selectedFile===node.path?' selected':''}`}>
  <button className={`file-row ${props.selectedFile===node.path?'active':''}`} draggable={!props.disabled} disabled={props.disabled} onDragStart={event=>{event.dataTransfer.setData('application/x-starview-file',node.path);event.dataTransfer.effectAllowed='move';setActions(null);}} onClick={()=>{setActions(null);props.onFileSelect(node.path);}} onContextMenu={event=>{if(props.onAction){event.preventDefault();openActions(node.path,event.currentTarget,event.clientX,event.clientY);}}}><span className="file-icon" aria-hidden="true">{node.name.endsWith('.tex')?'≡':'◇'}</span><span>{props.labels?.[node.path]||node.name.replace(/\.tex$/,'')}</span></button>
  {props.onAction&&<button className="file-more" disabled={props.disabled} aria-label={`Actions for ${node.name}`} title={`Actions for ${node.name}`} aria-haspopup="menu" aria-expanded={actions?.path===node.path} onClick={event=>openActions(node.path,event.currentTarget)}>⋯</button>}
 </div>:<details open><summary className={drop===node.path?'drop-target':''} onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-starview-file')){event.preventDefault();event.dataTransfer.dropEffect='move';setDrop(node.path);}}} onDragLeave={()=>setDrop('')} onDrop={event=>{event.preventDefault();event.stopPropagation();setDrop('');const source=event.dataTransfer.getData('application/x-starview-file');if(source&&!props.disabled)props.onMove?.(source,node.path);}}>{node.name}</summary>{branch(node.children)}</details>}</li>)}</ul>;}
 return <div className="file-tree-root" onDragOver={event=>{if(event.target===event.currentTarget&&event.dataTransfer.types.includes('application/x-starview-file'))event.preventDefault();}} onDrop={event=>{if(event.target===event.currentTarget){event.preventDefault();const source=event.dataTransfer.getData('application/x-starview-file');if(source&&!props.disabled)props.onMove?.(source,'');}}}>{branch(props.flat?props.files.map(path=>({path,name:path.split('/').pop()!,isFile:true,children:[]})):build(props.files))}
  {actions&&createPortal(<div ref={menu} role="menu" aria-label={`Actions for ${actions.path}`} className="file-context-menu" style={{left:actions.x,top:actions.y}} onKeyDown={event=>{const buttons=Array.from(menu.current?.querySelectorAll('button')||[]);const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='Tab')setActions(null);}}><button role="menuitem" onClick={()=>{props.onAction?.(actions.path,'move');setActions(null);}}>Rename or move…</button><button role="menuitem" className="file-delete-action" onClick={()=>{props.onAction?.(actions.path,'delete');setActions(null);}}>Move to trash</button></div>,document.body)}
 </div>;
}
