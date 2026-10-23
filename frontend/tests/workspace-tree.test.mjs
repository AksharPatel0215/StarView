import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/workspaceTree.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {workspaceTree}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const nodes=[{id:'root',title:'Mathematics',kind:'dashboard',level:'root',targets:['topic']},{id:'topic',title:'Analysis',kind:'dashboard',level:'topic',parent:'root',targets:['section']},{id:'section',title:'Limits',kind:'dashboard',level:'section',parent:'topic',targets:['Limits/one.tex']},{id:'cards',title:'Practice',kind:'flashcards',targets:['Limits/one.tex']}];
const files=['Limits/one.tex','Limits/index.tex','figures/plot.svg'];
const docs=[{path:'Limits/one.tex',title:'Continuity theorem'}];
const flatten=items=>items.flatMap(e=>[e,...flatten(e.children)]);
test('one tree combines dashboards, notes, flashcards, guides, and assets',()=>{
 const entries=workspaceTree(nodes,files,docs);const all=flatten(entries);
 for(const id of [...files,'root','topic','section','cards'])assert.equal(all.filter(e=>e.id===id).length,1,id);
 assert.equal(all.find(e=>e.id==='Limits/one.tex').title,'Continuity theorem');
 assert.equal(all.find(e=>e.id==='section').children.some(e=>e.id==='Limits/index.tex'),true);
});
test('search uses note titles and retains navigable ancestors',()=>{
 const all=flatten(workspaceTree(nodes,files,docs,'continuity'));
 assert.deepEqual(all.map(e=>e.id),['root','topic','section','Limits/one.tex']);
 assert.equal(workspaceTree(nodes,files,docs,'not present').length,0);
});
test('cyclic dashboard references do not recurse forever',()=>{
 const cycle=[...nodes.slice(0,3),{id:'loop',title:'Loop',kind:'dashboard',level:'root',targets:['loop']}];
 assert.ok(flatten(workspaceTree(cycle,[],[])).length<10);
});
