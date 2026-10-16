import {usePreferences} from '../preferences';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DocumentLink, KnowledgeGraph } from '../api/client';
import { createLayout, fitLayout, neighborhood, stepLayout, placeCaptions, arrangeNeighborhood, previewNeighbors, placePreviewNodes, clearPreviewPath, advanceBackground, starField, projectBackground } from '../graphLayout';
import type { CSSProperties } from 'react';
import type { Point } from '../graphLayout';
import {nodeRole,nodeRadius,pulseProfile} from '../nodeAppearance';
import { PALETTE, LIGHT_PALETTE, edgeColor, edgeLabels } from '../graphTheme';
import ColorPicker from './ColorPicker';
import EdgeEditor from './EdgeEditor';
import type { LabelHandler } from './EdgeEditor';

type Props = { visible?: boolean; graph: KnowledgeGraph; selected: string; busy: boolean; onOpen: (path: string) => void; onLabel: LabelHandler; onColor: (kind: 'tag' | 'relationship' | 'node', key: string, color: string | null) => Promise<void>; edge: DocumentLink | null; onEdge: (edge: DocumentLink | null) => void };
const pair = (edge: DocumentLink) => `${edge.source}\0${edge.target}`;
const clamp = (number: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, number));
export default function GraphExplorer({ visible = true, graph, selected, busy, onOpen, onLabel, onColor, edge, onEdge }: Props) {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [relation, setRelation] = useState('');
  const [scope, setScope] = useState('1');
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [hideIsolated, setHideIsolated] = useState(false);
  const [labels, setLabels] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const {preferences}=usePreferences();
  const lightTheme = preferences.theme === 'paper';
  const [paused, setPaused] = useState(() => (document.documentElement.dataset.motion==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [spacing, setSpacing] = useState(1.8);
  const [hover, setHover] = useState('');
  const [previewAnchor, setPreviewAnchor] = useState('');
  const previewDelay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissDelay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visibleRef = useRef(visible); visibleRef.current = visible;
  const [hoveredEdgeKey, setHoverEdge] = useState('');
  const [colorKind, setColorKind] = useState<'tag' | 'relationship' | 'node'>('tag');
  const [colorKey, setColorKey] = useState('');
  const [points, setPoints] = useState<Point[]>([]);
  const [camera, setCamera] = useState({ x: 200, y: 200, scale: .7 });
  const cameraRef = useRef(camera); cameraRef.current = camera;
  const focusFrame = useRef(0);
  const [size, setSize] = useState({ width: 400, height: 440 });
  const [reflow, setReflow] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const layout = useRef<Point[]>([]);
  const heat = useRef(1);
  const backgroundScreens = useRef(new Map<string,Point>());
  const viewportRef=useRef(size);viewportRef.current=size;
  const allPathsRef=useRef<string[]>([]);allPathsRef.current=graph.documents.map(node=>node.path);
  const layoutSettings = useRef({spacing:0,reflow:-1});
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const drag = useRef<{ id?: string; x: number; y: number; startX: number; startY: number; moved: boolean; camera: typeof camera } | null>(null);
  const skipClick = useRef(false);
  const markerId = useId().replace(/:/g, '');
  const relationships = [...new Set(['references', 'examples', 'contains', 'part of', 'prerequisite', 'related', ...graph.links.flatMap(edgeLabels)])].sort();
  const tags = [...new Set(graph.documents.flatMap(node => node.tags))].sort();
  const folders = [...new Set(graph.documents.map(node => node.tags[0] || 'Documents'))].sort();
  function fill(node: typeof graph.documents[number]) {
    return graph.styles?.node_colors[node.path] || node.tags.map(tag => graph.styles?.tag_colors[tag]).find(Boolean) || (lightTheme ? LIGHT_PALETTE[folders.indexOf(node.tags[0] || 'Documents') % LIGHT_PALETTE.length] : PALETTE[folders.indexOf(node.tags[0] || 'Documents') % PALETTE.length].color);
  }
  const degrees=useMemo(()=>{
    const result=new Map<string,number>();
    for(const link of graph.links){if(link.missing)continue;result.set(link.source,(result.get(link.source)||0)+1);result.set(link.target,(result.get(link.target)||0)+1);}
    return result;
  },[graph.links]);
  const displayPath=(path:string)=>path.startsWith('@node/')?graph.documents.find(node=>node.path===path)?.title||'Workspace node':path;
  const candidates = colorKind === 'tag' ? tags : colorKind === 'relationship' ? relationships : graph.documents.map(node => node.path);
  const pickedKey = candidates.includes(colorKey) ? colorKey : candidates[0] || '';
  const pickedColor = graph.styles?.[colorKind === 'tag' ? 'tag_colors' : colorKind === 'relationship' ? 'relationship_colors' : 'node_colors'][pickedKey] || null;
  const hasSelection = graph.documents.some(node => node.path === selected);
  const effectiveScope = hasSelection ? scope : 'all';
  const query = search.trim().toLowerCase();
  const matches = useMemo(() => new Set(graph.documents.filter(node => `${node.title} ${node.path} ${node.tags.join(' ')}`.toLowerCase().includes(query)).map(node => node.path)), [graph.documents, query]);
  const filtered = useMemo(() => {
    const links = graph.links.filter(link => !link.missing && (!relation || edgeLabels(link).includes(relation)));
    // Neighborhood controls emphasis; the surrounding constellation stays visible.
    const documents = graph.documents.filter(node => (!tag || node.tags.includes(tag)) && (!onlyMatches || !query || matches.has(node.path)));
    const ids = new Set(documents.map(node => node.path));
    const shownLinks = links.filter(link => ids.has(link.source) && ids.has(link.target));
    const connected = new Set(shownLinks.flatMap(link => [link.source, link.target]));
    return { documents: hideIsolated ? documents.filter(node => connected.has(node.path)) : documents, links: shownLinks };
  }, [graph.documents, graph.links, relation, effectiveScope, selected, tag, onlyMatches, query, matches, hideIsolated]);
  const signature = JSON.stringify([filtered.documents.map(node => node.path), filtered.links.map(pair)]);
  const simulationLinks = useRef(filtered.links); simulationLinks.current = filtered.links;
  const constellation = true;
  const active = selected || hover;
  const connectedToActive = neighborhood(active, filtered.links, effectiveScope === '2' ? 2 : 1);
  const previewCandidates = constellation && previewAnchor && connectedToActive.has(previewAnchor)
    ? previewNeighbors(previewAnchor, connectedToActive, filtered.links) : {visible:[],total:0};
  const previewNodes = new Set(previewCandidates.visible);
  const previewSignature=JSON.stringify([...previewNodes].sort());
  const enlarged = new Set([...connectedToActive,...previewNodes]);
  if (hover) enlarged.add(hover);
  const hoverLink = filtered.links.find(link => pair(link) === hoveredEdgeKey && (!constellation || (enlarged.has(link.source) && enlarged.has(link.target))));
  const hoverEdge = hoverLink ? hoveredEdgeKey : '';
  const labeledRelationships = new Set(filtered.links.filter(link=>hover && (link.source===hover || link.target===hover) && enlarged.has(link.source) && enlarged.has(link.target)).slice(0,3).map(pair));
  const stationary = useRef(new Set<string>());
  stationary.current = constellation ? enlarged : new Set(filtered.documents.map(node => node.path));
  const inspectionEdge = edge && graph.links.find(link => pair(link) === pair(edge));
  const hoveredNode = graph.documents.find(node => node.path === (hover || (constellation ? selected : '')));
  const hitCount = filtered.documents.filter(node => matches.has(node.path)).length;
  const position = projectBackground(points,backgroundScreens.current,camera);

  const captions = placeCaptions(filtered.documents.flatMap(node => {
    if (constellation && !enlarged.has(node.path)) return [];
    const point = position.get(node.path); return point ? [{id:node.path,title:node.title,x:point.x*camera.scale+camera.x,y:point.y*camera.scale+camera.y,priority:node.path===hover?10000:node.path===selected?9000:query&&matches.has(node.path)?8000:filtered.links.filter(link=>link.source===node.path||link.target===node.path).length}] : [];
  }),size.width,size.height);

  useEffect(() => {
    const target = svg.current; if (!target) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); cancelAnimationFrame(focusFrame.current); const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      setCamera(previous => { const scale = clamp(previous.scale * Math.exp(-event.deltaY * .0015), .08, 4); const ratio = scale / previous.scale; return { x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio, scale }; });
    };
    target.addEventListener('wheel', wheel, { passive: false }); return () => target.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { if (media.matches||document.documentElement.dataset.motion==='reduced') setPaused(true); };
    media.addEventListener('change', change);window.addEventListener('starview-preferences-change',change);change(); return () => {media.removeEventListener('change', change);window.removeEventListener('starview-preferences-change',change);};
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setExpanded(false); onEdge(null); setHover(''); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onEdge]);
  useEffect(() => {
    const target = stage.current; if (!target) return;
    const observer = new ResizeObserver(entries => {
      const next = { width: entries[0].contentRect.width, height: entries[0].contentRect.height };
      if(next.width<=0 || next.height<=0)return;
      setSize(previous=>previous.width===next.width&&previous.height===next.height?previous:next);
    });
    observer.observe(target); return () => observer.disconnect();
  }, [constellation]);
  useEffect(() => {
    const [paths] = JSON.parse(signature) as [string[], string[]];
    const rebuild = !layout.current.length || layoutSettings.current.spacing!==spacing || layoutSettings.current.reflow!==reflow;
    layout.current = createLayout(paths.map(path => ({ path })), rebuild ? [] : layout.current);
    if(rebuild){
      for (let tick = 0; tick < 160; tick++) stepLayout(layout.current, simulationLinks.current, .8, spacing);
      backgroundScreens.current.clear();
    }
    layoutSettings.current={spacing,reflow};
    heat.current = .8;
    setPoints(layout.current.map(node => ({ ...node })));
    const rect = stage.current?.getBoundingClientRect();
    if (!constellation) setCamera(fitLayout(layout.current, rect?.width || 400, rect?.height || 440, .75));
    let frame = 0, count = 0, lastTime: number | undefined;
    const animate = (time: number) => {
      const elapsed=lastTime===undefined?16:time-lastTime;lastTime=time;
      if (visibleRef.current && !pausedRef.current) {
        const view=viewportRef.current,cam=cameraRef.current;
        const homes=starField(allPathsRef.current,view.width,view.height);
        for(const node of layout.current){
          if(node.fx!==undefined || stationary.current.has(node.id)){
            backgroundScreens.current.delete(node.id);continue;
          }
          const home=homes.get(node.id);if(!home)continue;
          let screen=backgroundScreens.current.get(node.id);
          if(!screen){screen={...node,x:node.x*cam.scale+cam.x,y:node.y*cam.scale+cam.y};backgroundScreens.current.set(node.id,screen);}
          advanceBackground(screen,home,time,elapsed);
          node.x=(screen.x-cam.x)/cam.scale;node.y=(screen.y-cam.y)/cam.scale;
        }
        if (count++ % 2 === 0) setPoints(layout.current.map(node => ({ ...node })));
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [signature, spacing, reflow, constellation]);

  useEffect(() => {
    if (!selected || !layout.current.some(node=>node.id===selected)) return;
    const ids=neighborhood(selected,simulationLinks.current,1);
    promoteStars(ids);
    const targets = layout.current.map(node=>({...node}));
    const radius = arrangeNeighborhood(targets, simulationLinks.current, selected);
    const center = targets.find(node=>node.id===selected);
    if (!center) return;
    const starts=new Map(layout.current.map(node=>[node.id,{x:node.x,y:node.y}]));
    const scale=Math.max(.15,Math.min(1.2,(size.width-140)/(2*radius),(size.height-110)/(2*radius)));
    const destination={x:size.width/2-center.x*scale,y:(size.height-50)/2-center.y*scale,scale};
    const cameraStart=cameraRef.current;
    const reduced=preferences.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduced?0:700;
    let started: number | undefined;
    const transition=(time:number)=>{
      started ??= time;
      const progress=duration?Math.min(1,(time-started)/duration):1;
      const ease=progress*progress*(3-2*progress);
      for(const target of targets){
        if(!ids.has(target.id))continue;
        const node=layout.current.find(item=>item.id===target.id),start=starts.get(target.id);
        if(!node||!start)continue;
        node.x=start.x+(target.x-start.x)*ease;node.y=start.y+(target.y-start.y)*ease;node.vx=0;node.vy=0;
        if(node.fx!==undefined){node.fx=node.x;node.fy=node.y;}
      }
      setCamera({x:cameraStart.x+(destination.x-cameraStart.x)*ease,y:cameraStart.y+(destination.y-cameraStart.y)*ease,scale:cameraStart.scale+(destination.scale-cameraStart.scale)*ease});
      setPoints(layout.current.map(node=>({...node})));
      if(progress<1)focusFrame.current=requestAnimationFrame(transition);
    };
    focusFrame.current=requestAnimationFrame(transition);
    return ()=>cancelAnimationFrame(focusFrame.current);
  }, [selected, signature, constellation, size.width, size.height, reflow, preferences.reduceMotion]);

  useEffect(()=>{
    const ids=JSON.parse(previewSignature) as string[];
    const anchor=layout.current.find(node=>node.id===previewAnchor);
    if(!anchor || !ids.length)return;
    const foreground=neighborhood(selected,simulationLinks.current,1);
    const targets=placePreviewNodes(ids,anchor,layout.current,foreground,cameraRef.current,size.width,size.height);
    const obstacles=layout.current.filter(node=>foreground.has(node.id));
    const starts=new Map(layout.current.map(node=>[node.id,{x:node.x,y:node.y}]));
    let frame=0,started:number|undefined;
    const reduced=preferences.reduceMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate=(time:number)=>{
      started??=time;const p=reduced?1:Math.min(1,(time-started)/450),ease=p*p*(3-2*p);
      ids.forEach(id=>{
        const node=layout.current.find(item=>item.id===id),start=starts.get(id),target=targets.get(id);if(!node||!start||!target)return;
        const safe=clearPreviewPath({x:start.x+(target.x-start.x)*ease,y:start.y+(target.y-start.y)*ease},obstacles,64/cameraRef.current.scale);
        node.x=safe.x;node.y=safe.y;node.vx=0;node.vy=0;
      });
      setPoints(layout.current.map(node=>({...node})));
      if(p<1)frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);return()=>cancelAnimationFrame(frame);
  },[previewSignature,previewAnchor,selected,preferences.reduceMotion,size.width,size.height]);

  function clearInspection(){
    clearTimeout(previewDelay.current);clearTimeout(dismissDelay.current);
    setHover('');setPreviewAnchor('');setHoverEdge('');
  }
  useEffect(()=>{
    if(!visible){
      clearTimeout(previewDelay.current);clearTimeout(dismissDelay.current);
      setHover('');setPreviewAnchor('');setHoverEdge('');setExpanded(false);
    }
  },[visible]);
  useEffect(()=>()=>{clearTimeout(previewDelay.current);clearTimeout(dismissDelay.current);},[]);
  function leaveNode(){
    clearTimeout(previewDelay.current);clearTimeout(dismissDelay.current);
    if(drag.current)return;
    setHover('');
    dismissDelay.current=setTimeout(()=>{setPreviewAnchor('');setHoverEdge('');},220);
  }
  function promoteStars(ids:Iterable<string>){
    const cam=cameraRef.current;
    for(const id of ids){
      const screen=backgroundScreens.current.get(id),node=layout.current.find(item=>item.id===id);
      if(screen&&node){node.x=(screen.x-cam.x)/cam.scale;node.y=(screen.y-cam.y)/cam.scale;}
      backgroundScreens.current.delete(id);
    }
    setPoints(layout.current.map(node=>({...node})));
  }
  function inspectNode(path:string, immediate=false){
    promoteStars([path]);
    clearTimeout(previewDelay.current);clearTimeout(dismissDelay.current);
    setHover(path);
    if(connectedToActive.has(path)) {
      if(immediate)setPreviewAnchor(path);
      else previewDelay.current=setTimeout(()=>setPreviewAnchor(path),180);
    } else if(!previewNodes.has(path))setPreviewAnchor('');
  }

  function fit() { cancelAnimationFrame(focusFrame.current); setCamera(fitLayout(layout.current, size.width, size.height)); }
  function zoom(factor: number, x = size.width / 2, y = size.height / 2) {
    cancelAnimationFrame(focusFrame.current);
    setCamera(previous => { const scale = clamp(previous.scale * factor, .08, 4); const ratio = scale / previous.scale; return { x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio, scale }; });
  }
  function locate(path: string) {
    const point = layout.current.find(node => node.id === path); if (!point) return;
    setCamera({ x: size.width / 2 - point.x, y: size.height / 2 - point.y, scale: 1 }); setHover(path);
  }
  function begin(event: React.PointerEvent<SVGElement>, id?: string) {
    if (event.button !== 0) return;
    cancelAnimationFrame(focusFrame.current);
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
    if (current.id && !current.moved && !busy && event.type !== 'pointercancel') { skipClick.current = true; openGraphNode(current.id); }
    if (current.id && !current.moved) { const node = layout.current.find(node => node.id === current.id); if (node) { node.fx = undefined; node.fy = undefined; } }
    drag.current = null; if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
  }
  function openGraphNode(path: string) {
    clearTimeout(dismissDelay.current);
    clearTimeout(previewDelay.current);
    setPreviewAnchor('');
    // Preserve the full map even when the initial view had no selected document.
    if (constellation) setScope('all');
    onOpen(path);
  }
  function resetFilters() { setSearch(''); setTag(''); setRelation(''); setScope('1'); setOnlyMatches(false); setHideIsolated(false); }

  return <section className={`graph-explorer${constellation ? ' constellation' : ''}${expanded ? ' expanded' : ''}`} aria-label="Graph explorer" data-paused={paused}>
    <div className="graph-toolbar">
      <input type="search" aria-label="Search graph" placeholder="Find an idea…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select aria-label="Graph neighborhood" value={effectiveScope} disabled={!hasSelection} onChange={e=>setScope(e.target.value)}><option value="all">Whole workspace</option><option value="1">Direct neighbors</option><option value="2">Two steps away</option></select>
      <details className="graph-options-menu"><summary aria-label="Graph options">⋯</summary><div className="graph-options-popover"><h3>Graph options</h3><label>Labels<select aria-label="Graph tag filter" value={tags.includes(tag)?tag:''} onChange={e=>setTag(e.target.value)}><option value="">All labels</option>{tags.map(value=><option key={value}>{value}</option>)}</select></label><label>Relationships<select aria-label="Relationship filter" value={relation} onChange={e=>setRelation(e.target.value)}><option value="">All relationships</option>{relationships.map(value=><option key={value}>{value}</option>)}</select></label>      <div className="graph-options"><label><input type="checkbox" checked={onlyMatches} onChange={e => setOnlyMatches(e.target.checked)} />Only search matches</label><label><input type="checkbox" checked={hideIsolated} onChange={e => setHideIsolated(e.target.checked)} />Hide isolated</label><label><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} />Edge labels</label><button onClick={resetFilters}>Clear filters</button></div>
<label>Spacing<input aria-label="Graph spacing" type="range" min="0.8" max="3" step="0.1" value={spacing} onChange={e=>setSpacing(Number(e.target.value))}/></label><button disabled={preferences.reduceMotion} onClick={()=>setPaused(!paused)}>{paused?'Resume motion':'Pause motion'}</button><button onClick={()=>setReflow(value=>value+1)}>Rearrange</button>    <details className="graph-appearance"><summary>Colors & legend</summary><div className="graph-legend">{[...new Set(filtered.documents.flatMap(node => node.tags.slice(0, 1)))].map(value => <button key={value} onClick={() => setTag(value)}><span style={{ background: fill(filtered.documents.find(node => node.tags.includes(value))!) }}/>{value}</button>)}</div><div className="graph-filter-row"><select aria-label="Color category" value={colorKind} onChange={e => { setColorKind(e.target.value as typeof colorKind); setColorKey(''); }}><option value="tag">Node tag</option><option value="relationship">Relationship label</option><option value="node">Individual document</option></select><select aria-label="Category to color" value={pickedKey} disabled={!candidates.length} onChange={e => setColorKey(e.target.value)}>{candidates.map(value => <option key={value} value={value}>{colorKind==='node'?displayPath(value):value}</option>)}</select></div><ColorPicker label="Category color" value={pickedColor} disabled={busy || !pickedKey} onChange={color => { if (pickedKey) void onColor(colorKind, pickedKey, color); }}/><p>Individual colors take priority, followed by the first customized tag or relationship label. Auto uses the workspace palette.</p><p>Size labels: workspace, section, or note. Add one to a document’s Tags to override its size category. Dashboard hubs and section guides are recognized automatically; connections adjust size within each category.</p></details></div></details>
    </div>
    {query&&<div className="graph-search-results" role="status">{hitCount} matches{filtered.documents.filter(node=>matches.has(node.path)).slice(0,5).map(node=><button key={node.path} onClick={()=>locate(node.path)}>{node.title}</button>)}</div>}
    <div className="graph-stage" ref={stage}>
      <svg ref={svg} className="floating-graph" onMouseLeave={() => {if(!drag.current)clearInspection();}} role="group" aria-label="Interactive document graph" tabIndex={0} onPointerDown={event => begin(event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event => {
        if ((event.target as Element).closest('[data-node]')) return;
        if (event.key === '+' || event.key === '=') zoom(1.2); else if (event.key === '-') zoom(1 / 1.2); else if (event.key.toLowerCase() === 'f') fit(); else if (event.key.startsWith('Arrow')) setCamera(previous => ({ ...previous, x: previous.x + (event.key === 'ArrowLeft' ? 30 : event.key === 'ArrowRight' ? -30 : 0), y: previous.y + (event.key === 'ArrowUp' ? 30 : event.key === 'ArrowDown' ? -30 : 0) })); else return; event.preventDefault();
      }}>
        <defs>{filtered.links.map(link => <marker key={pair(link)} id={`${markerId}-${filtered.links.indexOf(link)}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7" fill={edgeColor(link, graph.styles, lightTheme)} /></marker>)}</defs>
        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.scale})`}>
          {filtered.links.map((link, index) => {
            const a = position.get(link.source), b = position.get(link.target); if (!a || !b || a.id === b.id) return null;
            const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
            const targetMode=constellation&&!enlarged.has(link.target)?'background':previewNodes.has(link.target)?'preview':'foreground';
            const targetNode=filtered.documents.find(node=>node.path===link.target)!;
            const nodeInset=(nodeRadius(targetNode,degrees.get(link.target)||0,targetMode)+4)/camera.scale;
            const x = b.x - dx / distance * Math.min(nodeInset, distance / 2), y = b.y - dy / distance * Math.min(nodeInset, distance / 2);
            const d = `M${a.x},${a.y} L${x},${y}`;
            const touchesEnlarged = !constellation || (enlarged.has(link.source) && enlarged.has(link.target));
            const followsHover = Boolean(hover) && ((link.source===hover && enlarged.has(link.target)) || (link.target===hover && enlarged.has(link.source)));
            const highlighted = (hoverEdge === pair(link) && touchesEnlarged) || followsHover || (!hover && (link.source===active || link.target===active));
            const faded = Boolean(active || hoverEdge) && !(hoverEdge ? hoverEdge === pair(link) : highlighted);
            return <g key={pair(link)} className={`space-edge${constellation && !highlighted ? ' background-edge' : ''}${highlighted ? ' highlighted' : ''}${faded ? ' dimmed' : ''}`} onMouseEnter={() => {if(touchesEnlarged)setHoverEdge(pair(link));}} onMouseLeave={() => setHoverEdge('')} onFocus={() => {if(touchesEnlarged)setHoverEdge(pair(link));}} onBlur={() => setHoverEdge('')}>
              <path className="edge-line" d={d} fill="none" stroke={edgeColor(link, graph.styles, lightTheme)} vectorEffect="non-scaling-stroke" strokeWidth={highlighted ? 1.1 : constellation ? .5 : 1} opacity={hoverEdge===pair(link) ? .65 : followsHover ? .32 : highlighted ? .2 : constellation ? .045 : .2} markerEnd={!constellation || highlighted ? `url(#${markerId}-${index})` : undefined} />
              <path className="edge-hit" pointerEvents={touchesEnlarged?undefined:"none"} d={d} fill="none" stroke="transparent" strokeWidth={12 / camera.scale} role="button" tabIndex={busy || !touchesEnlarged ? -1 : 0} aria-label={`Edit relationship: ${link.source} → ${link.target}; ${edgeLabels(link).join(', ')}`} onPointerDown={e => e.stopPropagation()} onClick={() => { if (!busy) onEdge(link); }} onKeyDown={e => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEdge(link); } }} />
              {((hoverEdge === pair(link) && touchesEnlarged) || labeledRelationships.has(pair(link)) || (labels && camera.scale > .65 && highlighted)) && <text className="edge-caption" x={(a.x+x)/2} y={(a.y+y)/2 - 5} textAnchor="middle" style={{ fontSize: 12 / camera.scale, strokeWidth: 4 / camera.scale }}>{edgeLabels(link).join(' · ')}</text>}
            </g>;
          })}
          {filtered.documents.map(node => {
            const point = position.get(node.path); if (!point) return null;
            const highlighted = constellation ? enlarged.has(node.path) : node.path === selected || node.path === hover || Boolean(query && matches.has(node.path));
            const faded = hoverEdge ? !(hoverLink?.source === node.path || hoverLink?.target === node.path) : Boolean(active) && !connectedToActive.has(node.path);
            const caption = captions.get(node.path) || (node.path===hover || node.path===selected ? {x:0,y:34,lines:[node.title.length>30?node.title.slice(0,28)+'…':node.title]} : undefined);
            const degree = degrees.get(node.path)||0;
            const radius=nodeRadius(node,degree,constellation&&!highlighted?'background':previewNodes.has(node.path)?'preview':'foreground');
            const pulse=pulseProfile(node.path,degree);
            return <g key={node.path} data-node={node.path} data-node-role={nodeRole(node)} transform={`translate(${point.x},${point.y})`} className={`space-node${constellation && !highlighted ? ' background-star' : ''}${faded && !highlighted ? ' dimmed' : ''}${highlighted ? ' highlighted' : ''}${previewNodes.has(node.path) ? ' preview-star' : ''}`} role="button" tabIndex={busy ? -1 : 0} aria-label={`Open ${node.title}`} aria-pressed={node.path === selected} onMouseEnter={() => inspectNode(node.path)} onMouseLeave={leaveNode} onFocus={() => inspectNode(node.path,true)} onBlur={leaveNode} onPointerDown={event => begin(event, node.path)} onClick={() => { if (skipClick.current) { skipClick.current = false; return; } if (!busy) { openGraphNode(node.path); } }} onKeyDown={e => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openGraphNode(node.path); } }}>
              <g className="star-body" style={{animationDelay:`-${(degree*1.7+node.path.length*.37)%8}s`,animationDuration:`${4+(node.path.length%5)}s`}} transform={`scale(${1 / camera.scale})`}>
              <circle r={Math.max(20,radius+8)} fill="transparent"/><g className="node-glyph"><circle className="node-halo" r={radius+(highlighted?10:5)} fill={fill(node)} opacity={highlighted ? .2 : constellation ? .05 : .08}/><circle className="node-core" r={radius} style={{"--node-radius":`${radius}px`,"--pulse-low":pulse.low,"--pulse-high":pulse.high,animationDuration:`${pulse.duration}s`,animationDelay:`${pulse.delay}s`} as CSSProperties} fill={fill(node)} stroke={highlighted ? 'var(--ui-text)' : 'var(--ui-canvas)'} strokeWidth={highlighted ? 2 : constellation ? 0 : 3}/>
              {(!constellation || highlighted)&&node.kind==='dashboard'&&<path d="M-6,0 L0,-6 L6,0 L0,6 Z" fill="#161b24" pointerEvents="none"/>}{(!constellation || highlighted)&&node.kind==='data'&&<path d="M-5,-4 H5 M-5,0 H5 M-5,4 H5" stroke="#161b24" strokeWidth="2" pointerEvents="none"/>}
              {(!constellation || highlighted) && point.fx !== undefined && <circle cx="12" cy="-13" r="3" fill="#e3b979"/>}
              </g>
              {caption && <text className="node-caption" x={caption.x} y={caption.y} textAnchor="middle" fontSize={14}>{caption.lines.map((line,index)=><tspan key={index} x={caption.x} dy={index?17:0}>{line}</tspan>)}</text>}
              </g>
            </g>;
          })}
        </g>
      </svg>
      {!filtered.documents.length && <div className="graph-empty">No nodes match this view.<button onClick={resetFilters}>Clear graph filters</button></div>}
      <div className="graph-navigation"><button aria-label="Zoom in" onClick={()=>zoom(1.25)}>+</button><button aria-label="Zoom out" onClick={()=>zoom(.8)}>−</button><button onClick={fit}>Fit</button></div>
    </div>
    <div className="graph-details" aria-live="polite">
      {hoveredNode && !drag.current && <div className="graph-tooltip" role="status"><strong>{hoveredNode.title}</strong><span>{hoveredNode.kind==='dashboard'?'Dashboard hub':hoveredNode.kind==='data'?'Connected resource':hoveredNode.path}</span><small>{hoveredNode.tags.join(' · ')} · {graph.links.filter(link => link.source === hoveredNode.path || link.target === hoveredNode.path).length} connections</small>{previewCandidates.total>previewNodes.size && <small>{previewNodes.size} nearby previews · {previewCandidates.total-previewNodes.size} more connections stay in the background</small>}</div>}
      {hoverLink && !hoveredNode && <div className="graph-tooltip"><strong>{edgeLabels(hoverLink).join(' · ')}</strong><span>{displayPath(hoverLink.source)} → {displayPath(hoverLink.target)}</span><small>Click to edit relationship</small></div>}
    </div>

    {inspectionEdge && <EdgeEditor edge={inspectionEdge} name={displayPath} busy={busy} labels={relationships} onSave={onLabel} onClose={() => onEdge(null)}/>}
  </section>;
}
