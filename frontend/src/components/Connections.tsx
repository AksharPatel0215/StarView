import { useState } from "react";
import GraphExplorer from "./GraphExplorer";
import { edgeColor, edgeLabels } from "../graphTheme";
import type { LabelHandler } from "./EdgeEditor";
import type { DocumentLink } from "../api/client";
import type { KnowledgeGraph } from "../api/client";
type Props = { graph: KnowledgeGraph; selected: string; busy: boolean; onOpen: (path: string) => void; onConnect: (source: string, target: string, remove?: boolean) => void; onLabel: LabelHandler; onColor: (kind: "tag" | "relationship" | "node", key: string, color: string | null) => Promise<void> };
export default function Connections({ graph, selected, busy, onOpen, onConnect, onLabel, onColor }: Props) {
  const [edge, setEdge] = useState<DocumentLink | null>(null);
  const [target, setTarget] = useState("");
  const document = graph.documents.find(node => node.path === selected);
  const choices = graph.documents.filter(node => node.path !== selected && !graph.links.some(link => link.source === selected && link.target === node.path));
  const outgoing = graph.links.filter(link => link.source === selected);
  const incoming = graph.links.filter(link => link.target === selected);
  const title = (path: string) => graph.documents.find(node => node.path === path)?.title || path;
  function links(items: typeof outgoing, backwards = false) {
    return items.length ? items.map(link => {
      const path = backwards ? link.source : link.target;
      const exists = graph.documents.some(node => node.path === path);
      return <div className="connection-row" key={`${link.source}:${link.target}`}>
        <button className="document-link" disabled={!exists || busy} onClick={() => onOpen(path)} title={path}>{title(path)}{!exists && " (missing)"}<small>{path}</small></button>
        <button className="edge-label-button" disabled={busy} title="Edit relationship labels and color" style={{ color: edgeColor(link, graph.styles) }} onClick={() => setEdge(link)}>{edgeLabels(link).join(" · ")}</button>
        {link.kind === "inline" ? <span className="inline-badge" title="Edit the [[link]] in the source to remove this connection">inline</span> : <button className="remove-link" aria-label={`Remove connection from ${link.source} to ${link.target}`} disabled={busy} onClick={() => onConnect(link.source, link.target, true)}>×</button>}
      </div>;
    }) : <p>{backwards ? "No documents link here yet." : "No outgoing connections yet."}</p>;
  }
  return <div className="connections">
    <GraphExplorer graph={graph} selected={selected} busy={busy} onOpen={onOpen} onLabel={onLabel} onColor={onColor} edge={edge} onEdge={setEdge}/>
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
