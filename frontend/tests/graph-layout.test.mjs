import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
// Transpile the pure layout module so these tests also run on Node versions
// without native TypeScript stripping.
const source = fs.readFileSync(new URL('../src/graphLayout.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { createLayout, arrangePath, isPathEdge, stepLayout, fitLayout, frameNeighborhood, neighborhood, placeCaptions, placeGraphCaptions, arrangeNeighborhood, arrangeReadableNeighborhood, previewNeighbors, placePreviewNodes, clearPreviewPath, advanceBackground, importanceRadius, starField, projectBackground, reframeBackground, previewRoute, pointOnRoute, previewCameraFor } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('a dense connected graph settles with finite coordinates and readable node separation', () => {
  const nodes = Array.from({ length: 24 }, (_, i) => ({ path: `cluster-${i % 4}/note-${i}.tex` }));
  const links = nodes.flatMap((node, i) => [1, 4, 7].map(offset => ({ source: node.path, target: nodes[(i + offset) % nodes.length].path })));
  const points = createLayout(nodes);
  for (let tick = 0; tick < 600; tick++) stepLayout(points, links, .8, 1);
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const minimum = Math.min(...points.flatMap((point, i) => points.slice(i + 1).map(other => Math.hypot(point.x - other.x, point.y - other.y))));
  assert.ok(minimum > 90, `Nodes collided: ${minimum}`);
  const camera = fitLayout(points, 1000, 600);
  for (const point of points) { assert.ok(point.x * camera.scale + camera.x > 0 && point.x * camera.scale + camera.x < 1000); assert.ok(point.y * camera.scale + camera.y > 0 && point.y * camera.scale + camera.y < 600); }
});

test('dragged pins remain fixed while the surrounding graph relaxes', () => {
  const points = createLayout([{ path: 'a' }, { path: 'b' }, { path: 'c' }]);
  points[0].fx = 350; points[0].fy = -200;
  for (let i = 0; i < 100; i++) stepLayout(points, [{ source: 'a', target: 'b' }]);
  assert.equal(points[0].x, 350); assert.equal(points[0].y, -200);
});

test('neighbor focus respects hop distance in both directions and excludes disconnected documents', () => {
  const edges = [{ source: 'a', target: 'b' }, { source: 'c', target: 'b' }, { source: 'c', target: 'd' }, { source: 'x', target: 'y' }];
  assert.deepEqual([...neighborhood('a', edges, 1)].sort(), ['a', 'b']);
  assert.deepEqual([...neighborhood('a', edges, 2)].sort(), ['a', 'b', 'c']);
});

test('coincident nodes separate instead of producing NaN coordinates', () => {
  const points = createLayout([{ path: 'a' }, { path: 'b' }]); points.forEach(point => { point.x = 0; point.y = 0; });
  for (let i = 0; i < 80; i++) stepLayout(points, []);
  assert.ok(Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) > 100);
  assert.deepEqual(fitLayout([], 1000, 600), { x: 500, y: 300, scale: 1 });
});

test('screen-space captions avoid overlaps and leave room for the graph toolbar',()=>{
 const items=[{id:'a',title:'Geometric Interpretation of the Derivative',x:150,y:100,priority:2},{id:'b',title:'Another nearby title',x:170,y:110,priority:1},{id:'c',title:'Bottom edge',x:150,y:290,priority:0}];
 const placed=placeCaptions(items,400,340);
 assert.ok(placed.has('a'));
 const boxes=[...placed].map(([id,label])=>{const node=items.find(item=>item.id===id);return {x:node.x-Math.max(...label.lines.map(line=>line.length))*7.5/2-4,y:node.y+label.y-13,w:Math.max(...label.lines.map(line=>line.length))*7.5+8,h:label.lines.length*17};});
 for(const [i,a] of boxes.entries()){assert.ok(a.y+a.h<=280);for(const b of boxes.slice(i+1))assert.ok(a.x+a.w+6<=b.x||b.x+b.w+6<=a.x||a.y+a.h+4<=b.y||b.y+b.h+4<=a.y);}
});


test('readable auto-framing preserves spacing while explicit fit can show every node',()=>{
 const points=createLayout([{path:'a'},{path:'b'}]);points[0].x=-1500;points[1].x=1500;
 assert.equal(fitLayout(points,400,500,.75).scale,.75);
 assert.ok(fitLayout(points,400,500).scale<.75);
});

test('increased spacing separates connected neighbors',()=>{
 const nodes=Array.from({length:8},(_,i)=>({path:`group/note-${i}`}));
 const links=nodes.slice(1).map(node=>({source:nodes[0].path,target:node.path}));
 function distances(spacing){const points=createLayout(nodes);for(let i=0;i<600;i++)stepLayout(points,links,.8,spacing);return points.slice(1).reduce((sum,p)=>sum+Math.hypot(p.x-points[0].x,p.y-points[0].y),0)/7;}
 assert.ok(distances(1.8)>distances(1)*1.3);
});


test('selection arranges only direct neighbors around its stationary center',()=>{
 const points=createLayout([{path:'a'},{path:'b'},{path:'c'},{path:'background'}]);
 const before=points.map(p=>({...p}));
 const radius=arrangeNeighborhood(points,[{source:'a',target:'b'},{source:'c',target:'a'},{source:'c',target:'background'}],'a');
 assert.equal(points[0].x,before[0].x);assert.equal(points[0].y,before[0].y);
 for(const p of points.slice(1,3))assert.ok(Math.abs(Math.hypot(p.x-points[0].x,p.y-points[0].y)-radius)<.001);
 assert.deepEqual(points[3],before[3]);
});


test('hub hover stays bounded, excludes enlarged nodes and retains the total count',()=>{
 const links=Array.from({length:40},(_,i)=>({source:'hub',target:`note-${i}`}));
 const result=previewNeighbors('hub',new Set(['hub','note-0','note-1']),links);
 assert.equal(result.visible.length,6);assert.equal(result.total,38);
 assert.ok(!result.visible.includes('note-0')&&!result.visible.includes('note-1'));
 assert.deepEqual(result,previewNeighbors('hub',new Set(['hub','note-0','note-1']),[...links].reverse()));
});


test('preview placement clears foreground nodes and stays inside the visible map',()=>{
 const nodes=createLayout([{path:'center'},{path:'left'},{path:'right'}]);
 nodes[0].x=0;nodes[0].y=0;nodes[1].x=-100;nodes[1].y=0;nodes[2].x=100;nodes[2].y=0;
 const camera={x:350,y:250,scale:1};
 const placed=placePreviewNodes(['a','b','c'],nodes[0],nodes,new Set(nodes.map(n=>n.id)),camera,700,500);
 assert.equal(placed.size,3);
 for(const p of placed.values()){for(const n of nodes)assert.ok(Math.hypot(p.x-n.x,p.y-n.y)>=60);assert.ok(p.x+350>=65&&p.x+350<=635);}
 const safe=clearPreviewPath({x:0,y:0},[nodes[0]],50);assert.ok(Math.hypot(safe.x,safe.y)>=50);
});


test('large hubs use staggered rings with clearance between neighbors',()=>{
 const nodes=[{path:'hub'},...Array.from({length:39},(_,i)=>({path:`note-${String(i).padStart(2,'0')}`}))];
 const points=createLayout(nodes),links=nodes.slice(1).map(node=>({source:'hub',target:node.path}));
 const outer=arrangeNeighborhood(points,links,'hub'),center=points[0];
 const radii=points.slice(1).map(node=>Math.round(Math.hypot(node.x-center.x,node.y-center.y)));
 assert.equal(new Set(radii).size,4);assert.equal(Math.max(...radii),outer);
 for(let i=1;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=185);
});


test('released preview eases toward a stable home without a teleport or anchor forces',()=>{
 const node=createLayout([{path:'star'}])[0];node.x=800;node.y=500;
 const home={x:0,y:0};advanceBackground(node,home,1000,16);
 assert.ok(node.x>750&&node.x<800);assert.ok(node.y>450&&node.y<500);
 for(let t=1016;t<6000;t+=16)advanceBackground(node,home,t,16);
 assert.ok(Math.hypot(node.x,node.y)<45);
});
test('connection importance increases size within usable bounds in every mode',()=>{
 for(const mode of ['background','preview','foreground']){
  assert.ok(importanceRadius(50,mode)>importanceRadius(2,mode));
  assert.ok(importanceRadius(100000,mode)<=23);
 }
 assert.ok(importanceRadius(10,'foreground')>importanceRadius(10,'preview'));
 assert.ok(importanceRadius(10,'preview')>importanceRadius(10,'background'));
});


test('background field fills the viewport evenly and is independent of input order',()=>{
 const paths=Array.from({length:40},(_,i)=>`note-${i}`),field=starField(paths,800,500);
 assert.deepEqual(field,starField([...paths].reverse(),800,500));
 const points=[...field.values()];
 assert.ok(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))>600);
 assert.ok(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))>300);
 const minimum=Math.min(...points.flatMap((p,i)=>points.slice(i+1).map(q=>Math.hypot(p.x-q.x,p.y-q.y))));
 assert.ok(minimum>35);
});


test('background stars keep screen positions during independent camera animation',()=>{
 const points=createLayout([{path:'star'},{path:'foreground'}]);
 const stars=new Map([['star',{x:240,y:180}]]);
 for(const camera of [{x:0,y:0,scale:1},{x:310,y:-120,scale:.25},{x:-70,y:90,scale:2}]){
  const projected=projectBackground(points,stars,camera),p=projected.get('star');
  assert.ok(Math.abs(p.x*camera.scale+camera.x-240)<.00001);
  assert.ok(Math.abs(p.y*camera.scale+camera.y-180)<.00001);
  assert.deepEqual(projected.get('foreground'),points[1]);
 }
});

test('wide resize preserves star identity and drift offsets without reclumping',()=>{
 const paths=Array.from({length:40},(_,i)=>'note-'+i),from={width:420,height:600},to={width:1800,height:600};
 const stars=starField(paths,from.width,from.height);for(const star of stars.values()){star.x+=8;star.y-=4;}
 reframeBackground(stars,paths,from,to);const homes=starField(paths,to.width,to.height);
 for(const id of paths){assert.ok(Math.abs(stars.get(id).x-homes.get(id).x-8)<1e-8);assert.ok(Math.abs(stars.get(id).y-homes.get(id).y+4)<1e-8);}
 assert.ok(Math.max(...[...stars.values()].map(p=>p.x))>1500);
});
test('labels clear large nodes on wide and narrow canvases',()=>{
 for(const width of [420,1800]){
  const node={id:'hub',title:'Complex Analysis Overview',x:width/2,y:180,radius:72,priority:10000};
  const caption=placeCaptions([node],width,600).get('hub');assert.ok(caption);
  assert.ok(caption.y-13>=node.radius+10 || caption.y+caption.lines.length*17<=-node.radius-5 || Math.abs(caption.x)>node.radius);
 }
});

test('candidate routes stay continuous and clear obstacles throughout the transition',()=>{
 const obstacles=[{id:'center',x:0,y:0,vx:0,vy:0}],route=previewRoute({x:-150,y:0},{x:150,y:0},obstacles,64);
 let previous=pointOnRoute(route,0);
 for(let i=1;i<=200;i++){const p=pointOnRoute(route,i/200);assert.ok(Math.hypot(p.x,p.y)>=63.99);assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y)<5);previous=p;}
 assert.deepEqual(pointOnRoute(route,1),{x:150,y:0});
});
test('dense enlarged groups retain every label, including fallback labels',()=>{
 const items=Array.from({length:14},(_,i)=>({id:'node'+i,title:'Complex Analysis Concept '+i,x:180+(i%4)*12,y:180+Math.floor(i/4)*12,radius:25,priority:14-i}));
 const captions=placeCaptions(items,420,600);assert.equal(captions.size,items.length);
 for(const label of captions.values())assert.ok(Number.isFinite(label.x)&&Number.isFinite(label.y)&&label.lines.length>0);
 const single=[{id:'a',title:'A stable label',x:200,y:200,radius:25,priority:1}];const first=placeCaptions(single,600,600);
 const second=placeCaptions([{...single[0],x:201}],600,600,first);assert.deepEqual(first.get('a'),second.get('a'));
});

test('hover candidates cannot displace the selected neighborhood labels',()=>{
 const base=[{id:'selected',title:'Selected concept',x:250,y:180,radius:40,priority:9000},{id:'neighbor',title:'Neighbor concept',x:440,y:250,radius:25,priority:5}];
 const original=placeGraphCaptions(base,new Set(),700,600);
 let previous=original;
 for(let i=0;i<30;i++){
  const items=[...base,{id:'candidate',title:'Hover candidate',x:250+i*6,y:225,radius:9,priority:1}];
  const next=placeGraphCaptions(items,new Set(['candidate']),700,600,previous);
  for(const item of base)assert.deepEqual(next.get(item.id),original.get(item.id));
  assert.ok(next.has('candidate'));previous=next;
 }
 const released=placeGraphCaptions(base,new Set(),700,600,previous);
 for(const item of base)assert.deepEqual(released.get(item.id),original.get(item.id));
});

test('readable neighborhoods use wide canvases without moving unrelated stars',()=>{
 const links=Array.from({length:8},(_,i)=>({source:'root',target:'neighbor'+i}));
 const nodes=createLayout([{path:'root'},...links.map(l=>({path:l.target})),{path:'background'}]);
 const background={...nodes.find(n=>n.id==='background')};
 arrangeReadableNeighborhood(nodes,links,'root',1400,700);
 const neighbors=nodes.filter(n=>n.id.startsWith('neighbor'));
 assert.ok(Math.max(...neighbors.map(n=>n.x))-Math.min(...neighbors.map(n=>n.x))>1000);
 assert.deepEqual(nodes.find(n=>n.id==='background'),background);
});
test('candidate placement stays within its actual anchor neighborhood',()=>{
 const anchor={id:'anchor',x:0,y:0,vx:0,vy:0},camera={x:500,y:300,scale:1};
 const targets=placePreviewNodes(['a','b','c'],anchor,[anchor],new Set(['anchor']),camera,1000,650);
 assert.equal(targets.size,3);
 for(const p of targets.values())assert.ok(Math.hypot(p.x-anchor.x,p.y-anchor.y)<=220.01);
 const points=[...targets.values()];for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=115);
});

test('hover camera centers the actual anchor and candidates point away from the selected node',()=>{
 for(const selected of [{x:-250,y:0},{x:250,y:0}]){
  const anchor={id:'anchor',x:0,y:0,vx:0,vy:0};
  const camera=previewCameraFor(anchor,{x:12,y:40,scale:1},1000,650);
  assert.equal(anchor.x*camera.scale+camera.x,500);assert.equal(anchor.y*camera.scale+camera.y,300);
  const nodes=[anchor,{id:'selected',...selected,vx:0,vy:0}];
  const candidates=placePreviewNodes(['a','b','c'],anchor,nodes,new Set(['anchor','selected']),camera,1000,650,selected);
  assert.equal(candidates.size,3);
  for(const p of candidates.values()){
   assert.ok((p.x-anchor.x)*(anchor.x-selected.x)+(p.y-anchor.y)*(anchor.y-selected.y)>0);
   assert.ok(Math.hypot(p.x-anchor.x,p.y-anchor.y)<=165.01);
  }
 }
});

test('selected neighborhood framing keeps top and bottom nodes and halos inside short canvases',()=>{
 for(const [width,height] of [[480,340],[400,220],[900,600]]){
  const nodes=createLayout(Array.from({length:9},(_,i)=>({path:String(i)})));
  const links=nodes.slice(1).map(node=>({source:'0',target:node.id}));
  arrangeReadableNeighborhood(nodes,links,'0',width,height);
  const camera=frameNeighborhood(nodes,'0',width,height);
  for(const node of nodes){const x=node.x*camera.scale+camera.x,y=node.y*camera.scale+camera.y;assert.ok(x>=54&&x<=width-54);assert.ok(y>=59&&y<=height-59);}
 }
});

test('agent foreground uses the exact normal ring arrangement with a different node set',()=>{
 const initial=createLayout(Array.from({length:15},(_,i)=>({path:String(i)})));
 const links=initial.slice(1,4).map(n=>({source:'0',target:n.id}));
 const normal=initial.map(n=>({...n})),same=initial.map(n=>({...n}));
 arrangeReadableNeighborhood(normal,links,'0',600,350);
 arrangeReadableNeighborhood(same,links,'0',600,350,new Set(['0','1','2','3']));
 assert.deepEqual(same,normal);
 const focused=new Set(initial.slice(0,12).map(n=>n.id));
 const agent=initial.map(n=>({...n}));
 arrangeReadableNeighborhood(agent,links,'0',600,350,focused);
 for(const n of agent.filter(n=>!focused.has(n.id)))assert.deepEqual(n,initial.find(p=>p.id===n.id));
 for(const n of agent.slice(1,12))assert.notDeepEqual({x:n.x,y:n.y},{x:initial.find(p=>p.id===n.id).x,y:initial.find(p=>p.id===n.id).y});
 const cam=frameNeighborhood(agent.filter(n=>focused.has(n.id)),'0',600,350);
 for(const n of agent.filter(n=>focused.has(n.id))){const y=n.y*cam.scale+cam.y;assert.ok(y>=59&&y<=291);}
});

test('long paths follow a wave in order and keep background positions intact',()=>{
 const nodes=createLayout(Array.from({length:10},(_,i)=>({path:String(i)})));const paths=['5','1','7','2','9','3','4'];const before=nodes.filter(n=>!paths.includes(n.id)).map(n=>({...n}));
 const camera=arrangePath(nodes,paths,650,350);
 const route=paths.map(id=>nodes.find(n=>n.id===id));
 for(let i=0;i<route.length;i++){assert.ok(route[i].y*camera.scale+camera.y>=69&&route[i].y*camera.scale+camera.y<=281);if(i)assert.equal(route[i].x-route[i-1].x,120);const x=route[i].x*camera.scale+camera.x;assert.ok(x>=59&&x<=591);}
 assert.deepEqual(nodes.filter(n=>!paths.includes(n.id)),before);
 for(let i=0;i<paths.length-1;i++){assert.ok(isPathEdge(paths,paths[i],paths[i+1]));assert.ok(isPathEdge(paths,paths[i+1],paths[i]));}
 assert.equal(isPathEdge(paths,paths[0],paths[3]),false);assert.equal(isPathEdge(paths,paths[0],'0'),false);
});

test('short paths stay straight while longer paths spread vertically within the canvas',()=>{
 let previous=0;
 for(const count of [2,3,5,8]){
 const nodes=createLayout(Array.from({length:count},(_,i)=>({path:String(i)})));const camera=arrangePath(nodes,nodes.map(n=>n.id),700,400);
 const ys=nodes.map(n=>n.y*camera.scale+camera.y);const spread=Math.max(...ys)-Math.min(...ys);
 if(count<=3)assert.equal(spread,0);else assert.ok(spread>previous);previous=spread;
 for(const y of ys)assert.ok(y>=69&&y<=331);
 }
});
