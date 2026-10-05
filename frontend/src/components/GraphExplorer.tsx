import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DocumentLink, KnowledgeGraph } from '../api/client';
import { createLayout, fitLayout, neighborhood, stepLayout } from '../graphLayout';
import type { Point } from '../graphLayout';
import { PALETTE, edgeColor, edgeLabels } from '../graphTheme';
import ColorPicker from './ColorPicker';
import EdgeEditor from './EdgeEditor';
import type { LabelHandler } from './EdgeEditor';

type Props = { graph: KnowledgeGraph; selected: string; busy: boolean; onOpen: (path: string) => void; onLabel: LabelHandler; onColor: (kind: 'tag' | 'relationship' | 'node', key: string, color: string | null) => Promise<void>; edge: DocumentLink | null; onEdge: (edge: DocumentLink | null) => void };
const pair = (edge: DocumentLink) => `${edge.source}\0${edge.target}`;
const clamp = (number: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, number));
export default function GraphExplorer({ graph, selected, busy, onOpen, onLabel, onColor, edge, onEdge }: Props) {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [relation, setRelation] = useState('');
  const [scope, setScope] = useState('all');
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [hideIsolated, setHideIsolated] = useState(false);
  const [labels, setLabels] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [spacing, setSpacing] = useState(1);
  const [hover, setHover] = useState('');
  const [hoverEdge, setHoverEdge] = useState('');
  const [colorKind, setColorKind] = useState<'tag' | 'relationship' | 'node'>('tag');
  const [colorKey, setColorKey] = useState('');
  const [points, setPoints] = useState<Point[]>([]);
  const [camera, setCamera] = useState({ x: 200, y: 200, scale: .7 });
  const [size, setSize] = useState({ width: 400, height: 440 });
  const [reflow, setReflow] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const layout = useRef<Point[]>([]);
  const heat = useRef(1);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const drag = useRef<{ id?: string; x: number; y: number; startX: number; startY: number; moved: boolean; camera: typeof camera } | null>(null);
  const skipClick = useRef(false);
  const markerId = useId().replace(/:/g, '');
  const relationships = [...new Set(['references', 'examples', 'contains', 'part of', 'prerequisite', 'related', ...graph.links.flatMap(edgeLabels)])].sort();
  const tags = [...new Set(graph.documents.flatMap(node => node.tags))].sort();
  const folders = [...new Set(graph.documents.map(node => node.tags[0] || 'Documents'))].sort();
  function fill(node: typeof graph.documents[number]) {
    return graph.styles?.node_colors[node.path] || node.tags.map(tag => graph.styles?.tag_colors[tag]).find(Boolean) || PALETTE[folders.indexOf(node.tags[0] || 'Documents') % PALETTE.length].color;
  }
  const displayPath=(path:string)=>path.startsWith('@node/')?graph.documents.find(node=>node.path===path)?.title||'Workspace node':path;
  const candidates = colorKind === 'tag' ? tags : colorKind === 'relationship' ? relationships : graph.documents.map(node => node.path);
  const pickedKey = candidates.includes(colorKey) ? colorKey : candidates[0] || '';
  const pickedColor = graph.styles?.[colorKind === 'tag' ? 'tag_colors' : colorKind === 'relationship' ? 'relationship_colors' : 'node_colors'][pickedKey] || null;
  const query = search.trim().toLowerCase();
  const matches = useMemo(() => new Set(graph.documents.filter(node => `${node.title} ${node.path} ${node.tags.join(' ')}`.toLowerCase().includes(query)).map(node => node.path)), [graph.documents, query]);
  const filtered = useMemo(() => {
    const links = graph.links.filter(link => !link.missing && (!relation || edgeLabels(link).includes(relation)));
    const allowed = scope === 'all' ? null : neighborhood(selected, links, Number(scope));
    const documents = graph.documents.filter(node => (!tag || node.tags.includes(tag)) && (!allowed || allowed.has(node.path)) && (!onlyMatches || !query || matches.has(node.path)));
    const ids = new Set(documents.map(node => node.path));
    const shownLinks = links.filter(link => ids.has(link.source) && ids.has(link.target));
    const connected = new Set(shownLinks.flatMap(link => [link.source, link.target]));
    return { documents: hideIsolated ? documents.filter(node => connected.has(node.path)) : documents, links: shownLinks };
  }, [graph.documents, graph.links, relation, scope, selected, tag, onlyMatches, query, matches, hideIsolated]);
  const signature = JSON.stringify([filtered.documents.map(node => node.path), filtered.links.map(pair)]);
  const simulationLinks = useRef(filtered.links); simulationLinks.current = filtered.links;
  const active = hover || selected;
  const connectedToActive = neighborhood(active, filtered.links, 1);
  const hoverLink = filtered.links.find(link => pair(link) === hoverEdge);
  const inspectionEdge = edge && graph.links.find(link => pair(link) === pair(edge));
  const hoveredNode = graph.documents.find(node => node.path === hover);
  const hitCount = filtered.documents.filter(node => matches.has(node.path)).length;
  const position = new Map(points.map(point => [point.id, point]));

  useEffect(() => {
    const target = svg.current; if (!target) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      setCamera(previous => { const scale = clamp(previous.scale * Math.exp(-event.deltaY * .0015), .08, 4); const ratio = scale / previous.scale; return { x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio, scale }; });
    };
    target.addEventListener('wheel', wheel, { passive: false }); return () => target.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { if (media.matches) setPaused(true); };
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setExpanded(false); onEdge(null); setHover(''); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onEdge]);
  useEffect(() => {
    const target = stage.current; if (!target) return;
    const observer = new ResizeObserver(entries => {
      const next = { width: entries[0].contentRect.width, height: entries[0].contentRect.height };
      setSize(next); setCamera(fitLayout(layout.current, next.width, next.height));
    });
    observer.observe(target); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const [paths] = JSON.parse(signature) as [string[], string[]];
    layout.current = createLayout(paths.map(path => ({ path })), reflow ? [] : layout.current);
    for (let tick = 0; tick < 160; tick++) stepLayout(layout.current, simulationLinks.current, .8, spacing);
    heat.current = .8;
    setPoints(layout.current.map(node => ({ ...node })));
    const rect = stage.current?.getBoundingClientRect();
    setCamera(fitLayout(layout.current, rect?.width || 400, rect?.height || 440));
    let frame = 0, count = 0;
    const animate = (time: number) => {
      if (!pausedRef.current) {
        heat.current = Math.max(.035, heat.current * .992);
        for (let tick = 0; tick < 2; tick++) stepLayout(layout.current, simulationLinks.current, heat.current, spacing);
        for (let i = 0; i < layout.current.length; i++) {
          const node = layout.current[i];
          if (node.fx === undefined) { node.vx += Math.sin(time / 4000 + i * 2.4) * .016; node.vy += Math.cos(time / 4700 + i * 1.7) * .016; }
        }
        if (count++ % 2 === 0) setPoints(layout.current.map(node => ({ ...node })));
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [signature, spacing, reflow]);

  function fit() { setCamera(fitLayout(layout.current, size.width, size.height)); }
  function zoom(factor: number, x = size.width / 2, y = size.height / 2) {
    setCamera(previous => { const scale = clamp(previous.scale * factor, .08, 4); const ratio = scale / previous.scale; return { x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio, scale }; });
  }
  function locate(path: string) {
    const point = layout.current.find(node => node.id === path); if (!point) return;
    setCamera({ x: size.width / 2 - point.x, y: size.height / 2 - point.y, scale: 1 }); setHover(path);
  }
  function begin(event: React.PointerEvent<SVGElement>, id?: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    svg.current?.setPointerCapture(event.pointerId);
    drag.current = { id, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, camera };
    if (id) { const node = layout.current.find(node => node.id === id); if (node) { node.fx = node.x; node.fy = node.y; } }
  }
  function move(event: React.PointerEvent<SVGSVGElement>) {
    const current = drag.current; if (!current) return;
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY;
    if (Math.hypot(dx, dy) > 4) current.moved = true;
    if (current.id) {
      const node = layout.current.find(node => node.id === current.id), rect = svg.current?.getBoundingClientRect();
      if (node && rect) { node.fx = (event.clientX - rect.left - camera.x) / camera.scale; node.fy = (event.clientY - rect.top - camera.y) / camera.scale; node.x = node.fx; node.y = node.fy; heat.current = .7; setPoints(layout.current.map(node => ({ ...node }))); }
    } else setCamera({ ...current.camera, x: current.camera.x + dx, y: current.camera.y + dy });
  }
  function end(event: React.PointerEvent<SVGSVGElement>) {
    const current = drag.current; if (!current) return;
    skipClick.current = current.moved;
    if (current.id && !current.moved && !busy && event.type !== 'pointercancel') { skipClick.current = true; onOpen(current.id); if (expanded) setExpanded(false); }
    if (current.id && !current.moved) { const node = layout.current.find(node => node.id === current.id); if (node) { node.fx = undefined; node.fy = undefined; } }
    drag.current = null; if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
  }
  function resetFilters() { setSearch(''); setTag(''); setRelation(''); setScope('all'); setOnlyMatches(false); setHideIsolated(false); }

  return <section className={`graph-explorer${expanded ? ' expanded' : ''}`} aria-label="Graph explorer">
    <div className="graph-explorer-heading"><div><strong>Workspace map</strong><small>{filtered.documents.length} / {graph.documents.length} nodes · {filtered.links.length} connections</small></div><button aria-label={expanded ? 'Close expanded graph' : 'Expand graph'} onClick={() => setExpanded(!expanded)}>{expanded ? 'Close ↙' : 'Expand ↗'}</button></div>
    <div className="graph-controls">
      <input type="search" aria-label="Search graph" placeholder="Find a title, file, or tag…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="graph-filter-row"><select aria-label="Graph tag filter" value={tags.includes(tag) ? tag : ''} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{tags.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Relationship filter" value={relation} onChange={e => setRelation(e.target.value)}><option value="">All relationships</option>{relationships.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Graph neighborhood" value={scope} disabled={scope === 'all' && !graph.documents.some(node => node.path === selected)} onChange={e => setScope(e.target.value)}><option value="all">Whole workspace</option><option value="1">Direct neighbors</option><option value="2">Two steps away</option></select></div>
      <div className="graph-options"><label><input type="checkbox" checked={onlyMatches} onChange={e => setOnlyMatches(e.target.checked)} />Only search matches</label><label><input type="checkbox" checked={hideIsolated} onChange={e => setHideIsolated(e.target.checked)} />Hide isolated</label><label><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} />Edge labels</label><button onClick={resetFilters}>Clear filters</button></div>
      {query && <div className="graph-search-results" aria-label="Graph search results"><span role="status">{hitCount} matches in this view</span>{filtered.documents.filter(node => matches.has(node.path)).slice(0, 8).map(node => <button key={node.path} title={node.path} onClick={() => locate(node.path)}>{node.title}</button>)}</div>}
    </div>
    <div className="graph-stage" ref={stage}>
      <svg ref={svg} className="floating-graph" role="group" aria-label="Interactive document graph" tabIndex={0} onPointerDown={event => begin(event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event => {
        if ((event.target as Element).closest('[data-node]')) return;
        if (event.key === '+' || event.key === '=') zoom(1.2); else if (event.key === '-') zoom(1 / 1.2); else if (event.key.toLowerCase() === 'f') fit(); else if (event.key.startsWith('Arrow')) setCamera(previous => ({ ...previous, x: previous.x + (event.key === 'ArrowLeft' ? 30 : event.key === 'ArrowRight' ? -30 : 0), y: previous.y + (event.key === 'ArrowUp' ? 30 : event.key === 'ArrowDown' ? -30 : 0) })); else return; event.preventDefault();
      }}>
        <defs>{filtered.links.map(link => <marker key={pair(link)} id={`${markerId}-${filtered.links.indexOf(link)}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7" fill={edgeColor(link, graph.styles)} /></marker>)}</defs>
        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.scale})`}>
          {filtered.links.map((link, index) => {
            const a = position.get(link.source), b = position.get(link.target); if (!a || !b || a.id === b.id) return null;
            const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
            const reciprocal = filtered.links.some(other => other.source === link.target && other.target === link.source);
            const curve = reciprocal ? 25 : 8;
            const cx = (a.x + b.x) / 2 - dy / distance * curve, cy = (a.y + b.y) / 2 + dx / distance * curve;
            const x = b.x - dx / distance * 17, y = b.y - dy / distance * 17;
            const d = `M${a.x},${a.y} Q${cx},${cy} ${x},${y}`;
            const highlighted = hoverEdge === pair(link) || link.source === active || link.target === active;
            const faded = Boolean(active || hoverEdge) && !(hoverEdge ? hoverEdge === pair(link) : highlighted);
            return <g key={pair(link)} className={`space-edge${faded ? ' dimmed' : ''}`} onMouseEnter={() => setHoverEdge(pair(link))} onMouseLeave={() => setHoverEdge('')}>
              <path d={d} fill="none" stroke={edgeColor(link, graph.styles)} strokeWidth={highlighted ? 2 : 1.2} opacity={highlighted ? .85 : .3} markerEnd={`url(#${markerId}-${index})`} />
              <path className="edge-hit" d={d} fill="none" stroke="transparent" strokeWidth={12 / camera.scale} role="button" tabIndex={busy ? -1 : 0} aria-label={`Edit relationship: ${link.source} → ${link.target}; ${edgeLabels(link).join(', ')}`} onPointerDown={e => e.stopPropagation()} onClick={() => { if (!busy) onEdge(link); }} onKeyDown={e => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEdge(link); } }} />
              {(hoverEdge === pair(link) || (labels && camera.scale > .65 && highlighted)) && <text className="edge-caption" x={(a.x + 2 * cx + x) / 4} y={(a.y + 2 * cy + y) / 4 - 5} textAnchor="middle" fill={edgeColor(link, graph.styles)}>{edgeLabels(link).join(' · ')}</text>}
            </g>;
          })}
          {filtered.documents.map(node => {
            const point = position.get(node.path); if (!point) return null;
            const highlighted = node.path === selected || node.path === hover || (query && matches.has(node.path));
            const faded = hoverEdge ? !(hoverLink?.source === node.path || hoverLink?.target === node.path) : Boolean(active) && !connectedToActive.has(node.path);
            const degree = filtered.links.filter(link => link.source === node.path || link.target === node.path).length;
            return <g key={node.path} data-node={node.path} transform={`translate(${point.x},${point.y})`} className={`space-node${faded && !highlighted ? ' dimmed' : ''}${highlighted ? ' highlighted' : ''}`} role="button" tabIndex={busy ? -1 : 0} aria-label={`Open ${node.title}`} aria-pressed={node.path === selected} onMouseEnter={() => setHover(node.path)} onMouseLeave={() => { if (!drag.current) setHover(''); }} onFocus={() => setHover(node.path)} onBlur={() => setHover('')} onPointerDown={event => begin(event, node.path)} onClick={() => { if (skipClick.current) { skipClick.current = false; return; } if (!busy) { onOpen(node.path); if (expanded) setExpanded(false); } }} onKeyDown={e => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(node.path); if (expanded) setExpanded(false); } }}>
              <title>{node.title}\n{node.path}\n{node.tags.join(', ')} · {degree} connections</title>
              <circle r="24" fill="transparent"/><circle className="node-halo" r={highlighted ? 21 : 16} fill={fill(node)} opacity={highlighted ? .2 : .08}/><circle className="node-core" r={Math.min(13, 6 + Math.sqrt(degree))} fill={fill(node)} stroke={highlighted ? '#f0e9ff' : '#171d28'} strokeWidth={highlighted ? 2 : 3}/>
              {node.kind==='dashboard'&&<path d="M-6,0 L0,-6 L6,0 L0,6 Z" fill="#161b24" pointerEvents="none"/>}{node.kind==='data'&&<path d="M-5,-4 H5 M-5,0 H5 M-5,4 H5" stroke="#161b24" strokeWidth="2" pointerEvents="none"/>}
              {point.fx !== undefined && <circle cx="12" cy="-13" r="3" fill="#e3b979"/>}
              <text className="node-caption" y="30" textAnchor="middle" fontSize={hover === node.path ? 13 : 12} fill={highlighted ? '#f0e9ff' : '#c2cbdc'}>{node.title.length > 27 && hover !== node.path ? node.title.slice(0, 25) + '…' : node.title}</text>
            </g>;
          })}
        </g>
      </svg>
      {!filtered.documents.length && <div className="graph-empty">No nodes match this view.<button onClick={resetFilters}>Clear graph filters</button></div>}
      <div className="graph-navigation"><button aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button><span>{Math.round(camera.scale * 100)}%</span><button aria-label="Zoom out" onClick={() => zoom(.8)}>−</button><button onClick={fit}>Fit</button><button aria-pressed={paused} onClick={() => { heat.current = .4; setPaused(!paused); }}>{paused ? 'Resume motion' : 'Pause motion'}</button><button title="Release dragged pins and rebuild the layout" onClick={() => setReflow(value => value + 1)}>Reflow</button></div>
      {hoveredNode && !drag.current && <div className="graph-tooltip" role="status"><strong>{hoveredNode.title}</strong><span>{hoveredNode.kind==='dashboard'?'Dashboard hub':hoveredNode.kind==='data'?'Connected resource':hoveredNode.path}</span><small>{hoveredNode.tags.join(' · ')} · {graph.links.filter(link => link.source === hover || link.target === hover).length} connections</small></div>}
      {hoverLink && !hoveredNode && <div className="graph-tooltip"><strong>{edgeLabels(hoverLink).join(' · ')}</strong><span>{displayPath(hoverLink.source)} → {displayPath(hoverLink.target)}</span><small>Click to edit relationship</small></div>}
    </div>
    <div className="graph-bottom"><span>Drag nodes to pin · drag space to pan · scroll to zoom · F to fit</span><label>Spacing<input aria-label="Graph spacing" type="range" min="0.8" max="1.8" step="0.1" value={spacing} onChange={e => setSpacing(Number(e.target.value))}/></label></div>
    <details className="graph-appearance"><summary>Colors & legend</summary><div className="graph-legend">{[...new Set(filtered.documents.flatMap(node => node.tags.slice(0, 1)))].map(value => <button key={value} onClick={() => setTag(value)}><span style={{ background: fill(filtered.documents.find(node => node.tags.includes(value))!) }}/>{value}</button>)}</div><div className="graph-filter-row"><select aria-label="Color category" value={colorKind} onChange={e => { setColorKind(e.target.value as typeof colorKind); setColorKey(''); }}><option value="tag">Node tag</option><option value="relationship">Relationship label</option><option value="node">Individual document</option></select><select aria-label="Category to color" value={pickedKey} disabled={!candidates.length} onChange={e => setColorKey(e.target.value)}>{candidates.map(value => <option key={value} value={value}>{colorKind==='node'?displayPath(value):value}</option>)}</select></div><ColorPicker label="Category color" value={pickedColor} disabled={busy || !pickedKey} onChange={color => { if (pickedKey) void onColor(colorKind, pickedKey, color); }}/><p>Individual colors take priority, followed by the first customized tag or relationship label. Auto uses the workspace palette.</p></details>
    {inspectionEdge && <EdgeEditor edge={inspectionEdge} name={displayPath} busy={busy} labels={relationships} onSave={onLabel} onClose={() => onEdge(null)}/>}
  </section>;
}
