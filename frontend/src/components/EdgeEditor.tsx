import { useEffect, useRef, useState } from 'react';
import type { DocumentLink } from '../api/client';
import { edgeLabels } from '../graphTheme';
import ColorPicker from './ColorPicker';
export type LabelHandler = (source: string, target: string, labels: string[], color: string | null) => Promise<void>;
export default function EdgeEditor({ edge, busy, labels: suggestions, onSave, onClose }: { edge: DocumentLink; busy: boolean; labels: string[]; onSave: LabelHandler; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const [labels, setLabels] = useState(edgeLabels(edge));
  const [draft, setDraft] = useState('');
  const [color, setColor] = useState<string | null>(edge.color || null);
  useEffect(() => { setLabels(edgeLabels(edge)); setColor(edge.color || null); setDraft(''); }, [edge]);
  return <section className="edge-inspector" aria-label="Relationship editor">
    <div className="inspector-heading"><strong>Relationship</strong><button aria-label="Close relationship editor" onClick={onClose}>×</button></div>
    <p className="edge-direction">{edge.source} <span>→</span> {edge.target}</p>
    <div className="relationship-tags">{labels.map(label => <button key={label} disabled={busy} onClick={() => setLabels(labels.filter(value => value !== label))} aria-label={`Remove relationship label ${label}`}>{label} ×</button>)}</div>
    <form onSubmit={e => { e.preventDefault(); if (draft.trim() && labels.length < 12) { setLabels([...new Set([...labels, draft.trim()])]); setDraft(''); } }}>
      <input ref={input} aria-label="New relationship label" value={draft} maxLength={60} placeholder="references, examples…" list="relationship-labels" disabled={busy} onChange={e => setDraft(e.target.value)}/><button disabled={busy || !draft.trim() || labels.length >= 12}>Add</button>
      <datalist id="relationship-labels">{suggestions.map(label => <option key={label} value={label}/>)}</datalist>
    </form>
    <p className="inspector-note">{edge.kind ? 'Keyword link: labels describe it; edit the source to remove the link.' : 'A saved connection between documents.'}</p>
    <ColorPicker label="Relationship color" value={color} onChange={setColor} disabled={busy}/>
    <button className="primary" disabled={busy || edge.missing} onClick={() => { const values = draft.trim() ? [...new Set([...labels, draft.trim()])] : labels; void onSave(edge.source, edge.target, values, color); }}>Save relationship</button>
  </section>;
}
