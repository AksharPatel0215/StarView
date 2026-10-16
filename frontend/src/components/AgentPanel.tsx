import {useEffect,useRef,useState} from 'react';
import AgentResponse from './AgentResponse';
import DraftDocument from './DraftDocument';
import {askAgent,getAgentStatus,getAgentProposals,reviewAgentProposal} from '../api/client';
import type {AgentReply,AgentStatus,AgentProposal,AgentChange} from '../api/client';
export default function AgentPanel({project,current,onClose,onOpen,beforeApply,onApplied}:{project:string;current:string;onClose:()=>void;onOpen:(path:string)=>void;beforeApply:()=>Promise<void>;onApplied:(paths:string[])=>Promise<void>}){
 const [status,setStatus]=useState<AgentStatus|null>(null),[model,setModel]=useState('');
 const [prompt,setPrompt]=useState(''),[working,setWorking]=useState(false),[error,setError]=useState('');
 const [conversation,setConversation]=useState<{role:'user'|'assistant';content:string;reply?:AgentReply}[]>([]);
 const [proposals,setProposals]=useState<AgentProposal[]>([]),[review,setReview]=useState<AgentProposal|null>(null),[drafts,setDrafts]=useState<AgentChange[]>([]);
 const alive=useRef(true);
 async function refreshStatus(){try{const next=await getAgentStatus();if(alive.current){setStatus(next);setModel(previous=>previous==='auto'||next.models.includes(previous)?previous:next.default_model);}}catch(e){if(alive.current)setError(String(e));}}
 useEffect(()=>{alive.current=true;void refreshStatus();getAgentProposals(project).then(p=>{if(alive.current)setProposals(p);}).catch(e=>{if(alive.current)setError(String(e));});return()=>{alive.current=false;};},[project]);
 async function send(){
  if(!prompt.trim()||working)return;
  const question=prompt.trim(),history=conversation.map(m=>({role:m.role,content:m.content}));
  setPrompt('');setError('');setWorking(true);setConversation(previous=>[...previous,{role:'user',content:question}]);
  try{await beforeApply();const reply=await askAgent(project,question,model,current,history.slice(-8));if(!alive.current)return;setConversation(previous=>[...previous,{role:'assistant',content:reply.answer,reply}]);if(reply.proposal)setProposals(previous=>[...previous,reply.proposal!]);}
  catch(e){if(alive.current){setError(e instanceof Error?e.message:String(e));setPrompt(question);}}
  finally{if(alive.current)setWorking(false);}
 }
 function openReview(proposal:AgentProposal){setReview(proposal);setDrafts(proposal.changes.map(c=>({...c,labels:[...c.labels]})));setError('');}
 async function decide(approve:boolean){
  if(!review||working)return;setWorking(true);setError('');
  try{if(approve)await beforeApply();await reviewAgentProposal(project,review.id,approve,drafts);setProposals(previous=>previous.filter(p=>p.id!==review.id));setReview(null);if(approve)await onApplied(drafts.filter(c=>c.kind==='create_note'||c.kind==='update_note').map(c=>c.path));}
  catch(e){setError(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
 }
 function update(index:number,patch:Partial<AgentChange>){setDrafts(previous=>previous.map((c,i)=>i===index?{...c,...patch}:c));}
 return <aside className="notes-agent" aria-label="Notes agent">
  <header><div><strong>Notes agent</strong><small>Local Ollama · review before applying</small></div><button aria-label="Close notes agent" onClick={onClose}>×</button></header>
  <div className="agent-model"><label htmlFor="agent-model">Model</label><select id="agent-model" value={model} disabled={working||!status?.available} onChange={e=>setModel(e.target.value)}><option value="auto">Automatic · quick answers / careful drafts</option>{!model&&<option value="">Choose a local model</option>}{status?.models.map(m=><option key={m}>{m}</option>)}</select><button aria-label="Refresh local models" disabled={working} onClick={()=>void refreshStatus()}>↻</button></div>
  {!status?.available&&<p className="agent-notice">{status?.message||'Connecting to local Ollama…'}</p>}
  {status?.available&&!status.models.length&&<p className="agent-notice">Install a local chat model in Ollama, then refresh.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {review?<div className="agent-review"><button className="subtle-control" disabled={working} onClick={()=>setReview(null)}>← Conversation</button><h3>Review {drafts.length} proposed {drafts.length===1?'change':'changes'}</h3><p>Check the draft and relationships. You can edit the text before approving.</p>
   {drafts.map((change,index)=><article key={index} className="agent-change"><strong>{change.kind.replaceAll('_',' ')}</strong><code>{change.path||`${change.source} → ${change.target}`}</code><p>{change.reason}</p>{!change.path&&<p>Current relationship: {review.before_edges?.find(e=>e.source===change.source&&e.target===change.target)?.labels?.join(', ')|| (review.before_edges?.some(e=>e.source===change.source&&e.target===change.target)?'related':'none')}</p>}
    {change.kind==='create_note'||change.kind==='update_note'?<>{review.before[change.path]!=null&&<details><summary>Current source</summary><pre>{review.before[change.path]}</pre></details>}<DraftDocument key={`${review.id}:${change.path}`} project={project} path={change.path} content={change.content} onChange={content=>update(index,{content})} onOpen={onOpen}/></>:change.kind!=='disconnect'&&<label>Relationship labels<input aria-label={`Relationship labels ${index+1}`} value={change.labels.join(', ')} onChange={e=>update(index,{labels:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></label>}
   </article>)}<div className="agent-review-actions"><button disabled={working} onClick={()=>void decide(false)}>Reject</button><button className="primary" disabled={working} onClick={()=>void decide(true)}>{working?'Working…':'Approve & apply'}</button></div>
  </div>:<><div className="agent-conversation" aria-live="polite">
    {!conversation.length&&<div className="agent-welcome"><h3>Work with your notes</h3><p>Ask how concepts relate, draft a new note, or propose connections. Answers use current note passages and graph relationships.</p><button onClick={()=>setPrompt('Explain how complex differentiability and the Cauchy–Riemann equations relate. Cite my notes.')}>Explain a relationship</button><button onClick={()=>setPrompt('Draft a standalone note about conformal maps, with definitions, a theorem, proof and examples. Propose connections to relevant existing notes for my review.')}>Draft a note</button><button onClick={()=>setPrompt('Suggest useful labeled connections between my existing notes about derivatives and geometry. Explain each proposed connection.')}>Suggest connections</button></div>}
    {conversation.map((m,index)=><article className={`agent-message ${m.role}`} key={index}><strong>{m.role==='user'?'You':'StarView'}</strong><div className="agent-answer">{m.role==='assistant'?<AgentResponse content={m.content}/>:m.content}</div>{m.reply&&<small className="agent-response-meta">{m.reply.model}{m.reply.timing?` · ${m.reply.timing.elapsed_seconds}s`:""}</small>}{m.reply&&<>{m.reply.citations.length>0&&<div className="agent-citations">{m.reply.citations.map(path=><button key={path} onClick={()=>onOpen(path)}>{path}</button>)}</div>}{m.reply.sources.length>0&&<details><summary>Retrieved passages ({m.reply.sources.length})</summary>{m.reply.sources.map((source,i)=><div className="agent-source" key={i}><button onClick={()=>onOpen(source.path)}>{source.path}:{source.line_start}–{source.line_end}</button><pre>{source.excerpt}</pre></div>)}</details>}</>}</article>)}
    {working&&<p role="status" className="agent-notice">Reading your notes and thinking locally…</p>}
   </div>{proposals.length>0&&<div className="agent-pending"><strong>Awaiting your review</strong>{proposals.map(p=><button key={p.id} disabled={working} onClick={()=>openReview(p)}>{p.changes.length} {p.changes.length===1?'change':'changes'} · {p.changes[0]?.path||p.changes[0]?.source||'Connections'} <span>Review →</span></button>)}</div>}
   <form className="agent-composer" onSubmit={e=>{e.preventDefault();void send();}}><label className="sr-only" htmlFor="agent-prompt">Ask your notes agent</label><textarea id="agent-prompt" placeholder="Ask about your notes or request a draft…" value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();void send();}}}/><button className="agent-send" aria-label={working?'Thinking':'Send message'} title="Send message (⌘/Ctrl + Enter)" disabled={working||!status?.available||!status.models.length||!model||!prompt.trim()}>{working?<span className="agent-send-busy">···</span>:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button><small>Files stay on this computer. Changes need your approval.</small></form></>}
 </aside>;
}
