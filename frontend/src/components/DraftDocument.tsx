import {lazy,Suspense,useEffect,useState} from 'react';
import {prepareDraft,draftError} from '../draftSource';
import {previewAgentDraft} from '../api/client';
const PdfPreview=lazy(()=>import('./PdfPreview'));
export default function DraftDocument({project,path,content,onChange,onOpen}:{project:string;path:string;content:string;onChange:(source:string)=>void;onOpen:(path:string)=>void}){
 const [mode,setMode]=useState<'code'|'preview'>('code');
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[repair,setRepair]=useState(false);
 useEffect(()=>{
  if(mode!=='preview')return;
  let active=true,objectUrl='';setUrl('');setError('');
  const timer=setTimeout(()=>{previewAgentDraft(project,path,content).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(e=>{if(active)setError(draftError(e instanceof Error?e.message:String(e)));});},200);
  return()=>{active=false;clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[mode,project,path,content]);
 return <section className="draft-document" aria-label={`Proposed document ${path}`}>
  <nav className="draft-view-switch" aria-label={`Draft view for ${path}`}><button type="button" aria-pressed={mode==='code'} onClick={()=>setMode('code')}>Code</button><button type="button" aria-pressed={mode==='preview'} onClick={()=>{const prepared=prepareDraft(content,path);if(prepared!==content){onChange(prepared);setRepair(true);}setMode('preview');}}>Preview</button></nav>
  {repair&&<p className="agent-notice">Added a missing title to the draft source. You can edit it in Code.</p>}
  {mode==='code'?<label>Proposed source<textarea aria-label={`Proposed source for ${path}`} value={content} spellCheck={false} onChange={e=>onChange(e.target.value)}/></label>:<div className="draft-preview">{error?<p className="error" role="alert">{error}</p>:url?<Suspense fallback={<p role="status">Opening preview…</p>}><PdfPreview url={url} onOpen={onOpen}/></Suspense>:<p role="status">Preparing LaTeX preview…</p>}</div>}
 </section>;
}
