import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/fixedPanels.ts',import.meta.url),'utf8');
const {fixedGeometry,restoreSplits}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('Notes stays left, Graph stays above Agent regardless of tool order',()=>{
 for(const tools of [['latex','agent','graph'],['graph','latex','agent'],['agent','graph','latex']]){
  const {windows:w}=fixedGeometry(tools,{width:1200,height:800});
  assert.equal(w.latex.x,0);assert.equal(w.latex.height,800);assert.equal(w.graph.x,w.agent.x);assert.equal(w.graph.width,w.agent.width);assert.ok(w.graph.y<w.agent.y);assert.ok(w.latex.width<w.graph.x);
 }
});
test('resizing cannot crush chat or graph, including small screens and extreme saved ratios',()=>{
 for(const width of [320,800,1400])for(const height of [400,700,1000])for(const columns of [.01,.55,.99])for(const rows of [.01,.64,.99]){
  const g=fixedGeometry(['latex','graph','agent'],{width,height},{columns,rows}),w=g.windows;
  assert.ok(w.latex.width>=339.99);assert.ok(w.agent.width>=399.99);assert.ok(w.agent.height>=259.99);assert.ok(w.graph.height>=319.99);
  const area=Object.values(w).reduce((sum,r)=>sum+r.width*r.height,0)+g.bars.reduce((sum,b)=>sum+b.rect.width*b.rect.height,0);
  assert.ok(Math.abs(area-g.width*g.height)<.001);
 }
});
test('closing tools expands remaining tools in their fixed regions',()=>{
 const viewport={width:1000,height:750};
 for(const tool of ['latex','graph','agent']){const g=fixedGeometry([tool],viewport);assert.equal(g.windows[tool].width,1000);assert.equal(g.windows[tool].height,750);assert.equal(g.bars.length,0);}
 const pair=fixedGeometry(['graph','agent'],viewport);assert.equal(pair.windows.graph.x,0);assert.equal(pair.windows.graph.width,1000);assert.equal(pair.bars[0].id,'rows');
 assert.deepEqual(restoreSplits('bad'),{columns:.55,rows:.68});assert.deepEqual(restoreSplits('{"columns":0.6,"rows":0.4}'),{columns:.6,rows:.4});
});
