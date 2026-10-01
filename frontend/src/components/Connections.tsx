import { useState } from "react";
import type { KnowledgeGraph } from "../api/client";
type Props = { graph: KnowledgeGraph; selected: string; busy: boolean; onOpen: (path: string) => void; onConnect: (source: string, target: string, remove?: boolean) => void };
export default function Connections({ graph, selected, busy, onOpen, onConnect }: Props) {
  const [target, setTarget] = useState("");
  const document = graph.documents.find(node => node.path === selected);
  const choices = graph.documents.filter(node => node.path !== selected && !graph.links.some(link => link.source === selected && link.target === node.path));
  const outgoing = graph.links.filter(link => link.source === selected);
  const incoming = graph.links.filter(link => link.target === selected);
  const title = (path: string) => graph.documents.find(node => node.path === path)?.title || path;
  const positions = new Map(graph.documents.map((node, index) => {
    const angle = (index / Math.max(1, graph.documents.length)) * 2 * Math.PI - Math.PI / 2;
    return [node.path, { x: 170 + Math.cos(angle) * 108, y: 130 + Math.sin(angle) * 88 }];
  }));
  function links(items: typeof outgoing, backwards = false) {
    return items.length ? items.map(link => {
      const path = backwards ? link.source : link.target;
      const exists = graph.documents.some(node => node.path === path);
      return <div className="connection-row" key={`${link.source}:${link.target}`}>
        <button className="document-link" disabled={!exists || busy} onClick={() => onOpen(path)} title={path}>{title(path)}{!exists && " (missing)"}<small>{path}</small></button>
        {link.kind === "inline" ? <span className="inline-badge" title="Edit the [[link]] in the source to remove this connection">inline</span> : <button className="remove-link" aria-label={`Remove connection from ${link.source} to ${link.target}`} disabled={busy} onClick={() => onConnect(link.source, link.target, true)}>×</button>}
      </div>;
    }) : <p>{backwards ? "No documents link here yet." : "No outgoing connections yet."}</p>;
  }
  return <div className="connections">
    <div className="graph-caption"><span>Workspace map</span><span>{graph.documents.length} documents · {graph.links.length} links</span></div>
    {graph.documents.length ? <svg className="graph" viewBox="0 0 340 260" aria-label="Document connection graph">
      <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="17" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="#796aa4" /></marker></defs>
      {graph.links.filter(link => !link.missing).map(link => {
        const a = positions.get(link.source), b = positions.get(link.target); if (!a || !b) return null;
        return <line className={selected === link.source || selected === link.target ? "graph-edge connected" : "graph-edge"} key={`${link.source}:${link.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected === link.source || selected === link.target ? "#b09beb" : "#4f506b"} strokeWidth="1.5" markerEnd="url(#arrow)" />;
      })}
      {graph.documents.map(node => {
        const pos = positions.get(node.path)!;
        return <g className={`graph-node${node.path === selected ? " selected" : ""}`} key={node.path} role="button" tabIndex={busy ? -1 : 0} aria-label={`Open ${node.title}`} onClick={() => { if (!busy) onOpen(node.path); }} onKeyDown={e => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(node.path); } }} style={{ cursor: busy ? "default" : "pointer" }}>
          <title>{node.path} · {node.tags.join(", ")}</title><circle cx={pos.x} cy={pos.y} r="24" fill="transparent" /><circle cx={pos.x} cy={pos.y} r={node.path === selected ? 11 : 7} fill={node.path === selected ? "#c1adff" : "#746599"} stroke="#252332" strokeWidth="4" />
          <text x={pos.x} y={pos.y + 25} textAnchor="middle" fill={node.path === selected ? "#e0d6ff" : "#a7b1c7"} fontSize="10">{node.title.length > 23 ? node.title.slice(0, 21) + "…" : node.title}</text>
        </g>;
      })}
    </svg> : <p>Open a folder with LaTeX documents to build your map.</p>}
    {document ? <><h2 className="connection-title">{document.title}</h2><p className="project-root">{document.path}</p>
      <div className="graph-tags">{document.tags.map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}</div><h3>Connect a document</h3>
      <form className="connect-form" onSubmit={e => { e.preventDefault(); const next = choices.find(node => node.path === target); if (next) { onConnect(selected, next.path); setTarget(""); } }}>
        <select aria-label="Document to connect" value={choices.some(node => node.path === target) ? target : ""} disabled={busy || choices.length === 0} onChange={e => setTarget(e.target.value)}><option value="">Choose a document…</option>{choices.map(node => <option key={node.path} value={node.path}>{node.title} — {node.path}</option>)}</select>
        <button className="primary" disabled={busy || !choices.some(node => node.path === target)}>Link</button>
      </form>
      <h3>Links from this document <span>{outgoing.length}</span></h3>{links(outgoing)}
      <h3>Backlinks <span>{incoming.length}</span></h3>{links(incoming, true)}
    </> : <p>Select a LaTeX document to connect it with another document.</p>}
    <p className="connections-hint">Connections describe relationships between your documents. They stay separate from the LaTeX build.</p>
  </div>;
}
