import {useEffect,useState} from 'react';
import {getTrash,restoreFile} from '../api/client';
import type {TrashItem} from '../api/client';
import useDialog from './useDialog';
export default function Trash({project,onRestore,onClose}:{project:string;onRestore:()=>Promise<void>;onClose:()=>void}) {
 const [items,setItems]=useState<TrashItem[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const ref=useDialog(()=>{if(!busy)onClose();});
 useEffect(()=>{getTrash(project).then(setItems).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[project]);
 return <div className="modal-backdrop"><section ref={ref} className="folder-browser" role="dialog" aria-modal="true" aria-labelledby="trash-title"><h2 id="trash-title">Workspace trash</h2><p>Restore files to their original folders. Existing files are never overwritten.</p>{error&&<p role="alert" className="error">{error}</p>}{loading?<p role="status">Loading…</p>:items.length===0?<p>Trash is empty.</p>:<ul className="directory-list">{items.map(item=><li key={item.id}><span>{item.path}</span><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await restoreFile(project,item.id);await onRestore();setItems(await getTrash(project));}catch(e){setError(e instanceof Error?e.message:'Could not restore file.');}finally{setBusy(false);}}}>Restore</button></li>)}</ul>}<div className="browser-actions"><button disabled={busy} onClick={onClose}>Done</button></div></section></div>;
}
