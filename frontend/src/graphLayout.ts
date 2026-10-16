// A cooled spring layout with repulsion, label clearance, and folder grouping.
// Layout positions stay in memory; document and relationship metadata stay on disk.
export type Point = { id: string; group: string; x: number; y: number; vx: number; vy: number; fx?: number; fy?: number };
export type Spring = { source: string; target: string };
function hash(value: string) { let result = 2166136261; for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619); return result >>> 0; }
export function createLayout(nodes: { path: string }[], previous: Point[] = []): Point[] {
  const old = new Map(previous.map(node => [node.id, node]));
  const groups = [...new Set(nodes.map(node => node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''))].sort();
  return nodes.map(node => {
    const existing = old.get(node.path); if (existing) return { ...existing };
    const group = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
    const angle = hash(node.path) / 4294967296 * Math.PI * 2;
    const groupAngle = groups.indexOf(group) / Math.max(1, groups.length) * Math.PI * 2;
    const radius = 60 + (hash(node.path + 'radius') % 210);
    return { id: node.path, group, x: Math.cos(groupAngle) * 220 + Math.cos(angle) * radius, y: Math.sin(groupAngle) * 220 + Math.sin(angle) * radius, vx: 0, vy: 0 };
  });
}
export function stepLayout(nodes: Point[], links: Spring[], heat = 1, spacing = 1): number {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const degree = new Map<string, number>();
  for (const edge of links) { degree.set(edge.source, (degree.get(edge.source) || 0) + 1); degree.set(edge.target, (degree.get(edge.target) || 0) + 1); }
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) + Math.abs(dy) < .01) { dx = .3 + i * .01; dy = .2 + j * .01; }
      const distance = Math.max(1, Math.hypot(dx, dy));
      const minimum = 190 * spacing;
      // Charge prevents dense bundles; collision gives room to node captions.
      const force = Math.min(9, 1200 * spacing * spacing / (distance * distance) + Math.max(0, minimum - distance) * .055) * heat;
      const x = dx / distance * force, y = dy / distance * force;
      a.vx -= x; a.vy -= y; b.vx += x; b.vy += y;
    }
  }
  // Treat reciprocal links as a single spring so backlinks do not over-tighten clusters.
  const seen = new Set<string>();
  for (const edge of links) {
    const key = [edge.source, edge.target].sort().join('\0'); if (seen.has(key) || edge.source === edge.target) continue; seen.add(key);
    const a = byId.get(edge.source), b = byId.get(edge.target); if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
    const desired = (a.group === b.group ? 220 : 310) * spacing;
    const force = (distance - desired) * .018 * heat / Math.sqrt(Math.max(degree.get(a.id) || 1, degree.get(b.id) || 1));
    const x = dx / distance * force, y = dy / distance * force;
    a.vx += x; a.vy += y; b.vx -= x; b.vy -= y;
  }
  const groups = new Map<string, { x: number; y: number; count: number }>();
  for (const node of nodes) { const center = groups.get(node.group) || { x: 0, y: 0, count: 0 }; center.x += node.x; center.y += node.y; center.count++; groups.set(node.group, center); }
  let energy = 0;
  for (const node of nodes) {
    const group = groups.get(node.group)!;
    node.vx += ((group.x / group.count - node.x) * .002 - node.x * .0005) * heat;
    node.vy += ((group.y / group.count - node.y) * .002 - node.y * .0005) * heat;
    node.vx = Math.max(-15, Math.min(15, node.vx * .76)); node.vy = Math.max(-15, Math.min(15, node.vy * .76));
    if (node.fx !== undefined && node.fy !== undefined) { node.x = node.fx; node.y = node.fy; node.vx = 0; node.vy = 0; }
    else { node.x += node.vx; node.y += node.vy; }
    energy += Math.abs(node.vx) + Math.abs(node.vy);
  }
  return energy;
}
export function fitLayout(nodes: Point[], width: number, height: number, minimumScale = .08) {
  if (!nodes.length) return { x: width / 2, y: height / 2, scale: 1 };
  const minX = Math.min(...nodes.map(node => node.x)) - 90, maxX = Math.max(...nodes.map(node => node.x)) + 90;
  const minY = Math.min(...nodes.map(node => node.y)) - 55, maxY = Math.max(...nodes.map(node => node.y)) + 65;
  const scale = Math.max(minimumScale, Math.min(1.6, (width - 36) / (maxX - minX), (height - 36) / (maxY - minY)));
  return { x: width / 2 - (minX + maxX) / 2 * scale, y: height / 2 - (minY + maxY) / 2 * scale, scale };
}
export function neighborhood(center: string, links: Spring[], depth: number): Set<string> {
  const paths = new Set([center]); let frontier = new Set([center]);
  for (let hop = 0; hop < depth; hop++) {
    const next = new Set<string>();
    for (const edge of links) { if (frontier.has(edge.source)) next.add(edge.target); if (frontier.has(edge.target)) next.add(edge.source); }
    frontier = new Set([...next].filter(path => !paths.has(path))); for (const path of frontier) paths.add(path);
  }
  return paths;
}

// Place readable screen-space captions without overlapping adjacent captions.
export function placeCaptions(items: { id: string; title: string; x: number; y: number; priority: number }[], width: number, height: number) {
  const placed = new Map<string, { x: number; y: number; lines: string[] }>();
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  const overlaps = (a: typeof boxes[number], b: typeof boxes[number]) => a.x < b.x + b.width + 6 && a.x + a.width + 6 > b.x && a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y;
  for (const item of [...items].sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id))) {
    const words = item.title.split(/\s+/), lines: string[] = []; let line = '';
    for (const word of words) { if (line && (line+' '+word).length > 20) { lines.push(line); line=word; } else line += (line?' ':'')+word; }
    if (line) lines.push(line);
    if (lines.length > 2) lines.splice(1, lines.length-1, lines.slice(1).join(' ').slice(0,22)+'…');
    const w = Math.max(...lines.map(line=>line.length))*7.5+8, h=lines.length*17;
    for (const y of [item.y+30, item.y-28-h]) {
      const box={x:item.x-w/2,y:y-13,width:w,height:h};
      if (box.x<8 || box.x+w>width-8 || box.y<8 || box.y+h>height-60) continue;
      if (boxes.some(other=>overlaps(box,other))) continue;
      boxes.push(box); placed.set(item.id,{x:0,y:y-item.y,lines}); break;
    }
  }
  return placed;
}


// Arrange the selected idea and its immediate neighbors as a stable, centered group.
export function arrangeNeighborhood(nodes: Point[], links: Spring[], selected: string) {
 const center=nodes.find(node=>node.id===selected);
 const ids=neighborhood(selected,links,1);
 const neighbors=nodes.filter(node=>node.id!==selected && ids.has(node.id)).sort((a,b)=>a.id.localeCompare(b.id));
 let rings=1,capacity=6;
 while(capacity<neighbors.length){rings++;capacity+=6+(rings-1)*4;}
 const outerRadius=220+(rings-1)*190;
 if(!center)return outerRadius;
 center.vx=0;center.vy=0;
 let offset=0;
 for(let ring=0;ring<rings;ring++){
  const count=Math.min(6+ring*4,Math.ceil((neighbors.length-offset)/(rings-ring)));
  const radius=220+ring*190;
  for(let slot=0;slot<count;slot++){
   const node=neighbors[offset+slot];
   const angle=-Math.PI/2+(slot+(ring%2)*.5)*2*Math.PI/count;
   node.x=center.x+Math.cos(angle)*radius;node.y=center.y+Math.sin(angle)*radius;node.vx=0;node.vy=0;
   if(node.fx!==undefined){node.fx=node.x;node.fy=node.y;}
  }
  offset+=count;
 }
 return outerRadius;
}


// Keep hover previews bounded even for hubs; favor specific notes over other hubs.
export function previewNeighbors(anchor: string, enlarged: Set<string>, links: Spring[], limit=6) {
 const candidates=[...neighborhood(anchor,links,1)].filter(id=>!enlarged.has(id));
 const degree=new Map<string,number>();
 for(const link of links){degree.set(link.source,(degree.get(link.source)||0)+1);degree.set(link.target,(degree.get(link.target)||0)+1);}
 candidates.sort((a,b)=>(degree.get(a)||0)-(degree.get(b)||0)||a.localeCompare(b));
 return {visible:candidates.slice(0,Math.max(0,limit)),total:candidates.length};
}

// Find visible preview positions with clearance from existing nodes and captions.
export function placePreviewNodes(ids: string[], anchor: Point, nodes: Point[], enlarged: Set<string>, camera: {x:number;y:number;scale:number}, width:number,height:number) {
 const result=new Map<string,{x:number;y:number}>();
 const screen=(p:{x:number;y:number})=>({x:p.x*camera.scale+camera.x,y:p.y*camera.scale+camera.y});
 const origin=screen(anchor), obstacles=nodes.filter(node=>enlarged.has(node.id)).map(screen);
 const occupied: {x:number;y:number}[]=[];
 const fits=(p:{x:number;y:number})=>p.x>=65&&p.x<=width-65&&p.y>=30&&p.y<=height-105
   && obstacles.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=75 && !(Math.abs(p.x-other.x)<95 && p.y>other.y+15 && p.y<other.y+65))
   && occupied.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=65);
 for(const id of ids){
  const candidates:{x:number;y:number}[]=[];
  for(const radius of [100,135,170,210,260])for(let i=0;i<48;i++){const angle=-Math.PI/2+i*Math.PI/24;candidates.push({x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius});}
  for(let y=35;y<height-105;y+=65)for(let x=70;x<width-65;x+=80)candidates.push({x,y});
  const candidate=candidates.find(fits);if(!candidate)continue;
  occupied.push(candidate);result.set(id,{x:(candidate.x-camera.x)/camera.scale,y:(candidate.y-camera.y)/camera.scale});
 }
 return result;
}

export function clearPreviewPath(point:{x:number;y:number}, obstacles:Point[], clearance:number) {
 const result={...point};
 for(let pass=0;pass<8;pass++)for(const obstacle of obstacles){
  const dx=result.x-obstacle.x,dy=result.y-obstacle.y,d=Math.hypot(dx,dy);
  if(d<clearance){const angle=d>.001?Math.atan2(dy,dx):0;result.x=obstacle.x+Math.cos(angle)*clearance;result.y=obstacle.y+Math.sin(angle)*clearance;}
 }
 return result;
}


// A node's drift depends only on its own stable resting position and elapsed time.
// Returning previews ease home instead of inheriting a different hover anchor's forces.
export function advanceBackground(node:Point, home:{x:number;y:number}, time:number, elapsed:number) {
 const phase=hash(node.id)/4294967296*Math.PI*2;
 const x=home.x+Math.sin(time/2600+phase)*30;
 const y=home.y+Math.cos(time/3300+phase)*24;
 const blend=1-Math.exp(-Math.max(0,Math.min(50,elapsed))/450);
 node.x+=(x-node.x)*blend;node.y+=(y-node.y)*blend;node.vx=0;node.vy=0;
}
export function importanceRadius(connections:number, mode:'background'|'preview'|'foreground') {
 const weight=Math.sqrt(Math.max(0,connections));
 return mode==='background'?Math.min(9.5,3.5+weight*.85):mode==='preview'?Math.min(13,7+weight*.6):Math.min(23,13+weight*1.05);
}


// Spread stars evenly across the visible canvas, independent of graph selection.
export function starField(paths:string[],width:number,height:number) {
 const sorted=[...paths].sort(),result=new Map<string,{x:number;y:number}>();
 for(let i=0;i<sorted.length;i++){
  const radius=Math.sqrt((i+.5)/Math.max(1,sorted.length));
  const angle=i*2.399963229728653;
  result.set(sorted[i],{x:width/2+Math.cos(angle)*radius*Math.max(20,width/2-45),y:(height-60)/2+Math.sin(angle)*radius*Math.max(20,(height-60)/2-40)});
 }
 return result;
}


// Project screen-space stars with the same camera used to render this frame.
// Camera animation and star animation may update on different animation frames.
export function projectBackground(points:Point[],stars:Map<string,{x:number;y:number}>,camera:{x:number;y:number;scale:number}) {
 return new Map(points.map(point=>{
  const star=stars.get(point.id);
  return [point.id,star&&point.fx===undefined?{...point,x:(star.x-camera.x)/camera.scale,y:(star.y-camera.y)/camera.scale}:point];
 }));
}
