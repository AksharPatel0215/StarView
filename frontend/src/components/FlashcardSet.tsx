import {useState} from 'react';
import {saveFlashcards} from '../api/client';
import type {Flashcard,WorkspaceNode} from '../api/client';
import {cardLabels,practiceScore} from '../flashcardSession';
import {shuffleCards} from '../flashcardOrder';
import AgentResponse from './AgentResponse';
function Icon({kind}:{kind:'edit'|'add'|'delete'}){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='edit'?<><path d="m15 4 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/></>:kind==='add'?<path d="M12 5v14M5 12h14"/>:<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></>}</svg>;}
export default function FlashcardSet({project,node,topics=[],onSaved}:{project:string;node:WorkspaceNode;topics?:string[];onSaved:(node:WorkspaceNode)=>void}){
 const cards=node.cards||[];
 const [order,setOrder]=useState(()=>shuffleCards(cards.map(c=>c.id)));
 const [selected,setSelected]=useState(order[0]||'');
 const [editing,setEditing]=useState<Flashcard|null>(null),[mode,setMode]=useState<'overview'|'study'|'edit'|'practice'>('overview'),[grades,setGrades]=useState<Record<string,boolean>>({}),[labelDraft,setLabelDraft]=useState(''),[revealed,setRevealed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[undo,setUndo]=useState<{cards:Flashcard[];selected:string}|null>(null);
 const ordered=[...order.filter(id=>cards.some(c=>c.id===id)),...(mode==='practice'?[]:cards.filter(c=>!order.includes(c.id)).map(c=>c.id))];
 const index=Math.max(0,ordered.indexOf(selected)),current=cards.find(c=>c.id===ordered[index]);

 async function persist(next:Flashcard[]){setBusy(true);setError('');try{onSaved(await saveFlashcards(project,node.id,next));return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}finally{setBusy(false);}}
 const score=practiceScore(ordered,grades);
 const covered=[...new Set(cards.flatMap(card=>card.labels||[]))];
 const topicNames=[...new Set([...topics,...covered])];
 function start(nextMode:'study'|'edit'|'practice',ids=cards.map(c=>c.id)){const next=nextMode==='practice'?shuffleCards(ids):ids;setOrder(next);setSelected(next[0]||'');setRevealed(false);setGrades({});setMode(nextMode);}
 function add(){setLabelDraft('');setEditing({id:crypto.randomUUID(),kind:'definition',front:'',back:'',labels:[]});}
 function grade(correct:boolean){if(!current||!revealed||Object.hasOwn(grades,current.id))return;const next={...grades,[current.id]:correct};setGrades(next);const remaining=ordered.find(id=>!Object.hasOwn(next,id));if(remaining){setSelected(remaining);setRevealed(false);}}

 function move(delta:number){if(!ordered.length)return;setRevealed(false);setSelected(ordered[(index+delta+ordered.length)%ordered.length]);}
 async function remove(){if(!current)return;const previous={cards:[...cards],selected:current.id};if(await persist(cards.filter(c=>c.id!==current.id))){setUndo(previous);setRevealed(false);setSelected(ordered[(index+1)%ordered.length]||'');}}
 return <section className="flashcard-set stack-set" aria-label="Flashcard set">
  {mode!=='overview'&&<nav className="card-toolbar" aria-label="Flashcard tools"><button disabled={busy||Boolean(editing)} onClick={()=>{setMode('overview');setRevealed(false);}}>← Overview</button>{mode==='edit'&&<><span className="card-toolbar-divider"/><button className="card-icon" aria-label="Edit current card" title="Edit current card" disabled={busy||!current||Boolean(editing)} onClick={()=>{if(current){setLabelDraft((current.labels||[]).join(', '));setEditing({...current});}}}><Icon kind="edit"/></button><button className="card-icon" aria-label="Add card" title="Add card" disabled={busy||Boolean(editing)} onClick={add}><Icon kind="add"/></button><button className="card-icon" aria-label="Delete current card" title="Delete current card" disabled={busy||!current||Boolean(editing)} onClick={()=>void remove()}><Icon kind="delete"/></button></>}</nav>}
  <header className="stack-heading"><div><span className="eyebrow">{mode==='overview'?'Flashcard set':mode==='study'?'Study':mode==='edit'?'Edit cards':'Practice'}</span><h1>{node.title}</h1></div></header>
  {error&&<p className="error" role="alert">{error}</p>}
  {undo&&mode!=='practice'&&<p className="flashcard-undo" role="status">Card deleted. <button disabled={busy} onClick={async()=>{if(await persist(undo.cards)){setSelected(undo.selected);setUndo(null);setRevealed(false);}}}>Undo</button></p>}
  {mode==='overview'?<div className="flashcard-overview">
   <div className="card-set-stats"><article><strong>{cards.length}</strong><span>Cards</span></article><article><strong>{cards.filter(c=>c.kind==='definition').length}</strong><span>Definitions</span></article><article><strong>{cards.filter(c=>c.kind==='problem').length}</strong><span>Practice problems</span></article></div>
   <section className="card-set-topics"><h2>Topics covered {topicNames.length>0&&<small>({topicNames.length})</small>}</h2>{topicNames.length?<div className="card-labels">{topicNames.map(topic=><span key={topic}>{topic}</span>)}</div>:<p>Add labels to your cards to organize the topics in this set.</p>}</section>
   <div className="card-mode-options"><button disabled={!cards.length} onClick={()=>start('study')}><strong>Study</strong><span>Flip through the set at your own pace.</span></button><button onClick={()=>start('edit')}><strong>Edit</strong><span>Add, change, label, or remove cards.</span></button><button disabled={!cards.length} onClick={()=>start('practice')}><strong>Practice</strong><span>Check your answers and track your score.</span></button></div>
  </div>:editing?<form key={editing.id} className="flashcard-editor" onSubmit={async e=>{e.preventDefault();const another=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='another';const saved={...editing,labels:cardLabels(labelDraft)};const next=cards.some(c=>c.id===editing.id)?cards.map(c=>c.id===editing.id?saved:c):[...cards,saved];if(await persist(next)){setSelected(editing.id);setRevealed(false);setEditing(another?{id:crypto.randomUUID(),kind:editing.kind,front:'',back:'',labels:saved.labels}:null);setUndo(null);}}}>
   <label>Card type<select value={editing.kind} disabled={busy} onChange={e=>setEditing({...editing,kind:e.target.value as Flashcard['kind']})}><option value="definition">Definition</option><option value="problem">Practice problem</option></select></label>
   <label>{editing.kind==='definition'?'Term or question':'Problem'}<textarea autoFocus required maxLength={20000} disabled={busy} value={editing.front} onChange={e=>setEditing({...editing,front:e.target.value})} placeholder="What is complex differentiability?"/></label>
   <label>{editing.kind==='definition'?'Definition or answer':'Solution'}<textarea required maxLength={20000} disabled={busy} value={editing.back} onChange={e=>setEditing({...editing,back:e.target.value})} placeholder="Write an answer. LaTeX math is supported."/></label>
   <label>Labels<input maxLength={1000} disabled={busy} value={labelDraft} onChange={e=>setLabelDraft(e.target.value)} placeholder="Derivatives, Cauchy–Riemann"/><small>Separate labels with commas. Up to 16 labels, 64 characters each.</small></label>
   <div className="flashcard-actions"><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button><button className="primary" disabled={busy||!editing.front.trim()||!editing.back.trim()||cardLabels(labelDraft).length>16||cardLabels(labelDraft).some(label=>label.length>64)}>{busy?'Saving…':'Save card'}</button><button value="another" disabled={busy||!editing.front.trim()||!editing.back.trim()||cardLabels(labelDraft).length>16||cardLabels(labelDraft).some(label=>label.length>64)}>Save & add another</button></div>
  </form>:mode==='practice'&&score.complete?<section className="practice-results"><span className="eyebrow">Session complete</span><h2>{score.correct} / {score.total} correct</h2><p>{Math.round(score.correct/score.total*100)}% · Self-checked against the card answers.</p><div className="flashcard-actions"><button onClick={()=>start('practice')}>Practice again</button>{score.missed.length>0&&<button onClick={()=>start('practice',score.missed)}>Retry missed cards ({score.missed.length})</button>}<button onClick={()=>setMode('overview')}>Overview</button></div></section>:current?<div className="card-study" onKeyDown={e=>{if(mode!=='practice'&&e.key==='ArrowRight'){e.preventDefault();move(1);}if(mode!=='practice'&&e.key==='ArrowLeft'){e.preventDefault();move(-1);}}}>
   {mode==='practice'&&<div className="practice-score" role="status"><span>{score.answered} / {score.total} checked</span><strong>{score.correct} correct · {score.answered-score.correct} to review</strong><progress value={score.answered} max={score.total} aria-label="Practice progress"/></div>}
   {Boolean(current.labels?.length)&&<div className="card-labels">{current.labels!.map(label=><span key={label}>{label}</span>)}</div>}
   <div className={`card-stack${cards.length===1?' single-card':''}`}>
    <div className="stack-under stack-under-far" aria-hidden="true"/><div className="stack-under stack-under-near" aria-hidden="true"/>
    <div className={`flip-card${revealed?' is-flipped':''}`} role="button" tabIndex={0} aria-label={revealed?'Show question':'Show answer'} aria-pressed={revealed} onClick={()=>{if(!window.getSelection()?.toString())setRevealed(!revealed);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setRevealed(!revealed);}}}>
     <div key={current.id} className="flip-card-inner">
      <div className="flip-card-face flip-card-front" aria-hidden={revealed}><small>{current.kind==='definition'?'Definition':'Practice problem'}</small><div className="card-content"><AgentResponse content={current.front}/></div><span className="card-flip-hint">Click or press Space to flip</span></div>
      <div className="flip-card-face flip-card-back" aria-hidden={!revealed}><small>{current.kind==='definition'?'Definition':'Solution'}</small><div className="card-content"><AgentResponse content={current.back}/></div><span className="card-flip-hint">Click to return to the question</span></div>
     </div>
    </div>
   </div>
   {mode==='practice'?<div className="practice-check"><p>Compare your answer with the back of the card, then score yourself.</p><div className="flashcard-actions"><button disabled={!revealed} onClick={()=>grade(false)}>Needs review</button><button className="primary" disabled={!revealed} onClick={()=>grade(true)}>Correct</button></div></div>:<nav className="card-navigation" aria-label="Browse flashcards"><button aria-label="Previous card" disabled={cards.length<2} onClick={()=>move(-1)}>←</button><span>{index+1} / {cards.length}</span><button aria-label="Next card" disabled={cards.length<2} onClick={()=>move(1)}>→</button></nav>}
  </div>:<div className="empty-state"><h2>Your first card</h2><p>Use the + above to add a definition or practice problem.</p></div>}
 </section>;
}
