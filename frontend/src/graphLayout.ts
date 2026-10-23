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
export function placeCaptions(items: { id: string; title: string; x: number; y: number; priority: number;radius?:number }[], width: number, height: number, preferred=new Map<string,{x:number;y:number;lines:string[]}>(),reserved:{x:number;y:number;width:number;height:number}[]=[]) {
 const placed=new Map<string,{x:number;y:number;lines:string[]}>();
 const boxes:{x:number;y:number;width:number;height:number}[]=[...reserved];
 const overlaps=(a:typeof boxes[number],b:typeof boxes[number])=>a.x<b.x+b.width+7&&a.x+a.width+7>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;
 const obstacles=items.map(item=>({x:item.x-(item.radius||18)-5,y:item.y-(item.radius||18)-5,width:2*((item.radius||18)+5),height:2*((item.radius||18)+5)}));
 for(const item of [...items].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){
  if(item.x<0||item.x>width||item.y<0||item.y>height-52)continue;
  const lines:string[]=[];let line='';
  const words=item.title.split(/\s+/).flatMap(word=>word.match(/.{1,26}/g)||[]);
  for(const word of words){if(line&&(line+' '+word).length>26){lines.push(line);line=word;}else line+=(line?' ':'')+word;}
  if(line)lines.push(line);
  const maxLines=item.priority>=9000?3:2;
  if(lines.length>maxLines){lines.splice(maxLines-1,lines.length-maxLines+1,lines.slice(maxLines-1).join(' ').slice(0,25)+'…');}
  if(!lines.length)continue;
  const w=Math.max(...lines.map(l=>l.length))*7.2+10,h=lines.length*17,r=(item.radius||18)+14;
  const previous=preferred.get(item.id);
  const last=previous&&Math.hypot(previous.x,previous.y)<240?previous:undefined;
  const candidates=[...(last?[{x:item.x+last.x,y:item.y+last.y}]:[]),{x:item.x,y:item.y+r+13},{x:item.x,y:item.y-r-h+13},{x:item.x+r+w/2,y:item.y-h/2+13},{x:item.x-r-w/2,y:item.y-h/2+13}];
  for(const candidate of candidates){
   const box={x:candidate.x-w/2,y:candidate.y-13,width:w,height:h};
   if(box.x<8||box.x+w>width-8||box.y<8||box.y+h>height-52)continue;
   if(boxes.some(other=>overlaps(box,other))||obstacles.some(other=>overlaps(box,other)))continue;
   boxes.push(box);placed.set(item.id,{x:candidate.x-item.x,y:candidate.y-item.y,lines});break;
  }
  if(!placed.has(item.id)){
   const overlapArea=(a:typeof boxes[number],b:typeof boxes[number])=>Math.max(0,Math.min(a.x+a.width,b.x+b.width+7)-Math.max(a.x,b.x-7))*Math.max(0,Math.min(a.y+a.height,b.y+b.height+5)-Math.max(a.y,b.y-5));
   const laneWidth=Math.min(w,Math.max(80,width-20));
   let best:{x:number;y:number;cost:number}|undefined;
   const local=[...candidates,...[35,65,95].flatMap(gap=>[{x:item.x,y:item.y+r+13+gap},{x:item.x,y:item.y-r-h+13-gap}])];
   for(const candidate of local){
    const x=Math.max(8,Math.min(width-laneWidth-8,candidate.x-laneWidth/2)),y=Math.max(8,Math.min(height-52-h,candidate.y-13));
    const box={x,y,width:laneWidth,height:h};
    const cost=boxes.reduce((sum,b)=>sum+overlapArea(box,b)*6,0)+obstacles.reduce((sum,b)=>sum+overlapArea(box,b)*3,0)+Math.hypot(x+laneWidth/2-item.x,y+13-item.y)*.1;
    if(!best||cost<best.cost)best={x,y,cost};
   }
   if(best){boxes.push({x:best.x,y:best.y,width:laneWidth,height:h});placed.set(item.id,{x:best.x+laneWidth/2-item.x,y:best.y+13-item.y,lines});}
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
export function placePreviewNodes(ids: string[], anchor: Point, nodes: Point[], enlarged: Set<string>, camera: {x:number;y:number;scale:number}, width:number,height:number,selected?:{x:number;y:number}) {
 const result=new Map<string,{x:number;y:number}>();
 const screen=(p:{x:number;y:number})=>({x:p.x*camera.scale+camera.x,y:p.y*camera.scale+camera.y});
 const origin=screen(anchor), obstacles=nodes.filter(node=>enlarged.has(node.id)).map(screen);
 const center=selected?screen(selected):obstacles.reduce((sum,p)=>({x:sum.x+p.x/Math.max(1,obstacles.length),y:sum.y+p.y/Math.max(1,obstacles.length)}),{x:0,y:0});
 const outward=Math.hypot(origin.x-center.x,origin.y-center.y)<1?-Math.PI/2:Math.atan2(origin.y-center.y,origin.x-center.x);
 const occupied: {x:number;y:number}[]=[];
 const fits=(p:{x:number;y:number})=>p.x>=65&&p.x<=width-65&&p.y>=30&&p.y<=height-105
   && obstacles.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=75 && !(Math.abs(p.x-other.x)<95 && p.y>other.y+15 && p.y<other.y+65))
   && occupied.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=115);
 for(const id of ids){
  const candidates:{x:number;y:number}[]=[];
  for(const radius of [105,125,145,165])for(let i=0;i<25;i++){const angle=outward+(i-12)*Math.PI/36;candidates.push({x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius});}

  candidates.sort((a,b)=>{const score=(p:{x:number;y:number})=>Math.hypot(p.x-origin.x,p.y-origin.y)+25*(1-Math.cos(Math.atan2(p.y-origin.y,p.x-origin.x)-outward));return score(a)-score(b);});
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

export function reframeBackground(stars:Map<string,{x:number;y:number}>,paths:string[],from:{width:number;height:number},to:{width:number;height:number}){
 const oldHomes=starField(paths,from.width,from.height),newHomes=starField(paths,to.width,to.height);
 for(const [id,star] of stars){const before=oldHomes.get(id),after=newHomes.get(id);if(before&&after){star.x+=after.x-before.x;star.y+=after.y-before.y;}}
}

// Plan once, then follow a continuous path. Projecting out of obstacles on every
// animation frame can flip between opposite sides and make candidates shake.
export function previewRoute(start:{x:number;y:number},target:{x:number;y:number},obstacles:Point[],clearance:number){
 const safe=clearPreviewPath(start,obstacles,clearance+1);
 const clear=(a:{x:number;y:number},b:{x:number;y:number})=>obstacles.every(o=>{
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/length)):0;
  return (a.x+t*dx-o.x)**2+(a.y+t*dy-o.y)**2>=(clearance-.01)**2;
 });
 if(clear(safe,target))return [safe,target];
 const vertices=[safe,target];
 const radius=(clearance+3)/Math.cos(Math.PI/12);
 for(const o of obstacles)for(let i=0;i<12;i++){
  const angle=i*Math.PI/6,p={x:o.x+Math.cos(angle)*radius,y:o.y+Math.sin(angle)*radius};
  if(obstacles.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=clearance))vertices.push(p);
 }
 const distance=vertices.map(()=>Infinity),previous=vertices.map(()=>-1),visited=new Set<number>();distance[0]=0;
 for(let step=0;step<vertices.length;step++){
  let next=-1;for(let i=0;i<vertices.length;i++)if(!visited.has(i)&&(next<0||distance[i]<distance[next]))next=i;
  if(next<0||!Number.isFinite(distance[next]))break;
  if(next===1){const route=[];for(let i=1;i!==-1;i=previous[i])route.unshift(vertices[i]);return route;}
  visited.add(next);
  for(let i=0;i<vertices.length;i++)if(!visited.has(i)&&clear(vertices[next],vertices[i])){
   const candidate=distance[next]+Math.hypot(vertices[next].x-vertices[i].x,vertices[next].y-vertices[i].y);
   if(candidate<distance[i]){distance[i]=candidate;previous[i]=next;}
  }
 }
 // No safe corridor: appear at the valid destination rather than oscillating.
 return [target,target];
}
export function pointOnRoute(route:{x:number;y:number}[],progress:number){
 if(progress>=1)return route[route.length-1];
 if(progress<=0)return route[0];
 const lengths=route.slice(1).map((p,i)=>Math.hypot(p.x-route[i].x,p.y-route[i].y));
 let remaining=lengths.reduce((sum,length)=>sum+length,0)*Math.max(0,Math.min(1,progress));
 for(let i=0;i<lengths.length;i++){
  if(remaining<=lengths[i]&&lengths[i]>0){const t=remaining/lengths[i];return {x:route[i].x+(route[i+1].x-route[i].x)*t,y:route[i].y+(route[i+1].y-route[i].y)*t};}
  remaining-=lengths[i];
 }
 return route[route.length-1];
}


// Hover candidates get their own label pass. They must never displace labels in
// the selected neighborhood, even when their paths cross it during a transition.
export function placeGraphCaptions(items:{id:string;title:string;x:number;y:number;priority:number;radius?:number}[],previews:Set<string>,width:number,height:number,preferred=new Map<string,{x:number;y:number;lines:string[]}>()){
 const base=items.filter(item=>!previews.has(item.id));
 const captions=placeCaptions(base,width,height,preferred);
 const reserved=base.flatMap(item=>{
  const radius=(item.radius||18)+5;
  const boxes=[{x:item.x-radius,y:item.y-radius,width:radius*2,height:radius*2}];
  const label=captions.get(item.id);
  if(label){const w=Math.max(...label.lines.map(line=>line.length))*7.2+10;boxes.push({x:item.x+label.x-w/2,y:item.y+label.y-13,width:w,height:label.lines.length*17});}
  return boxes;
 });
 const candidates=placeCaptions(items.filter(item=>previews.has(item.id)),width,height,preferred,reserved);
 return new Map([...captions,...candidates]);
}

// Use the actual canvas shape, reserving horizontal room for adjacent labels.
// Dense groups may extend beyond a small panel instead of shrinking into a knot.
export function arrangeReadableNeighborhood(nodes:Point[],links:Spring[],selected:string,width:number,height:number,foreground?:Set<string>){
 const center=nodes.find(node=>node.id===selected);if(!center)return;
 const ids=foreground||neighborhood(selected,links,1),neighbors=nodes.filter(n=>n.id!==selected&&ids.has(n.id)).sort((a,b)=>a.id.localeCompare(b.id));
 const rings=Math.max(1,Math.ceil(neighbors.length/8));
 const rx=Math.max(150+(rings-1)*115,(width-240)/2),ry=Math.max(150+(rings-1)*95,(height-170)/2);
 let offset=0;
 for(let ring=0;ring<rings;ring++){
  const count=Math.ceil((neighbors.length-offset)/(rings-ring));
  const fraction=(ring+1)/rings;
  for(let slot=0;slot<count;slot++){
   const node=neighbors[offset+slot],angle=-Math.PI/2+(slot+(ring%2)*.5)*Math.PI*2/count;
   node.x=center.x+Math.cos(angle)*rx*fraction;node.y=center.y+Math.sin(angle)*ry*fraction;node.vx=0;node.vy=0;
   if(node.fx!==undefined){node.fx=node.x;node.fy=node.y;}
  }
  offset+=count;
 }
}


export function previewCameraFor(anchor:{x:number;y:number},camera:{x:number;y:number;scale:number},width:number,height:number){
 const scale=Math.max(.8,Math.min(1.2,camera.scale));
 return {x:width/2-anchor.x*scale,y:(height-50)/2-anchor.y*scale,scale};
}

// Node bodies keep their screen size when the camera zooms, so reserve pixel margins.
export function frameNeighborhood(nodes:Point[],selected:string,width:number,height:number){
 const center=nodes.find(node=>node.id===selected);
 if(!center)return fitLayout(nodes,width,height);
 const dx=Math.max(1,...nodes.map(node=>Math.abs(node.x-center.x)));
 const dy=Math.max(1,...nodes.map(node=>Math.abs(node.y-center.y)));
 const scale=Math.max(.01,Math.min(1,Math.max(1,width/2-55)/dx,Math.max(1,height/2-60)/dy));
 return {x:width/2-center.x*scale,y:height/2-center.y*scale,scale};
}

export function arrangePath(nodes:Point[],paths:readonly string[],width:number,height:number){
 const map=new Map(nodes.map(node=>[node.id,node]));
 const ordered=paths.map(path=>map.get(path)).filter((node):node is Point=>!!node);
 const step=120;
 const extent=Math.max(1,(ordered.length-1)*step);
 const scale=Math.min(1,Math.max(1,width-120)/extent);
 // Short routes stay direct; longer routes use more of the available vertical space.
 const growth=Math.min(1,Math.max(0,(ordered.length-3)/5));
 const amplitude=Math.max(0,(height-140)/2)*growth;
 const cycles=Math.min(2,1+Math.max(0,ordered.length-10)/12);
 ordered.forEach((node,index)=>{
  const progress=index/Math.max(1,ordered.length-1);
  node.x=(index-(ordered.length-1)/2)*step;
  node.y=amplitude*Math.sin(progress*Math.PI*2*cycles)/scale;
  node.vx=0;node.vy=0;
  if(node.fx!==undefined){node.fx=node.x;node.fy=node.y;}
 });
 return {x:width/2,y:height/2,scale};
}

export function isPathEdge(paths:readonly string[],source:string,target:string){
 return paths.some((path,index)=>index<paths.length-1&&((path===source&&paths[index+1]===target)||(path===target&&paths[index+1]===source)));
}
