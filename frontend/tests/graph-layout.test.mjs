import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
// Transpile the pure layout module so these tests also run on Node versions
// without native TypeScript stripping.
const source = fs.readFileSync(new URL('../src/graphLayout.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { createLayout, stepLayout, fitLayout, neighborhood, placeCaptions, arrangeNeighborhood, previewNeighbors, placePreviewNodes, clearPreviewPath, advanceBackground, importanceRadius, starField, projectBackground } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

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
 const placed=placePreviewNodes(['a','b','c','d','e','f'],nodes[0],nodes,new Set(nodes.map(n=>n.id)),camera,700,500);
 assert.equal(placed.size,6);
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
