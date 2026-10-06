import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export default function CompactMenu({label,children}:{label:string;children:ReactNode}) {
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  return <details ref={ref} className="compact-menu"><summary>{label}<span aria-hidden="true">⌄</span></summary><div className="compact-menu-body" onClick={event=>{if((event.target as HTMLElement).closest('button')&&ref.current)ref.current.open=false;}}>{children}</div></details>;
}
