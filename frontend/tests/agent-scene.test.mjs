import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/agentScene.ts',import.meta.url),'utf8');
const {sceneGraph,responsePaths}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const doc=path=>({path,title:path,tags:[],is_main:false});
const graph={documents:['a.tex','b.tex','c.tex','unrelated.tex','isolated.tex'].map(doc),links:[{source:'a.tex',target:'b.tex',missing:false},{source:'b.tex',target:'c.tex',missing:false},{source:'b.tex',target:'unrelated.tex',missing:false}]};
test('connecting concepts includes their existing path without unrelated branches',()=>{
 const g=sceneGraph(graph,{paths:['a.tex','c.tex'],proposal:null});
 assert.deepEqual([...g.focusPaths].sort(),['a.tex','b.tex','c.tex']);assert.equal(g.documents.length,graph.documents.length);assert.equal(g.links.length,graph.links.length);
});
test('disconnected concepts stay disconnected instead of fabricating a relationship',()=>{
 const g=sceneGraph(graph,{paths:['a.tex','isolated.tex'],proposal:null});assert.deepEqual(g.focusPaths,['a.tex','isolated.tex']);assert.deepEqual(g.links,graph.links);assert.equal(g.documents.length,graph.documents.length);
});
test('drafts are an immutable overlay and rejection removes every provisional item',()=>{
 const before=JSON.stringify(graph);
 const proposal={changes:[{kind:'create_note',path:'new.tex',content:'\\title{New concept}'},{kind:'connect',source:'new.tex',target:'a.tex',labels:['explains']}]};
 const g=sceneGraph(graph,{paths:['a.tex'],proposal});
 assert.equal(g.documents.find(d=>d.path==='new.tex').provisional,true);assert.equal(g.links.find(e=>e.source==='new.tex').provisional,true);assert.equal(JSON.stringify(graph),before);
 const rejected=sceneGraph(graph,{paths:['a.tex'],proposal:null});assert.ok(rejected.documents.every(d=>!d.provisional));assert.ok(rejected.links.every(e=>!e.provisional));
});
test('pending label edits and removals are marked without changing official relationships',()=>{
 const g=sceneGraph(graph,{paths:[],proposal:{changes:[{kind:'disconnect',source:'a.tex',target:'b.tex'},{kind:'label_connection',source:'b.tex',target:'c.tex',labels:['prerequisite']}]}});
 assert.equal(g.links.find(e=>e.source==='a.tex').draft_action,'disconnect');assert.deepEqual(g.links.find(e=>e.source==='b.tex').labels,['prerequisite']);assert.equal(graph.links[1].labels,undefined);
});
test('only real cited notes can drive navigation and explicitly named notes take priority',()=>{
 assert.deepEqual(responsePaths('Explain c.tex',{citations:['a.tex','missing.tex']},graph),['c.tex','a.tex']);
});

test('retrieval focus preserves all background nodes and edges while excluding them from emphasis',()=>{
 const g=sceneGraph(graph,{paths:['a.tex','c.tex'],proposal:null});
 assert.deepEqual(g.documents,graph.documents);assert.deepEqual(g.links,graph.links);assert.ok(!g.focusPaths.includes('unrelated.tex'));assert.ok(!g.focusPaths.includes('isolated.tex'));
});

test('retrieved notes appear in source order even when the model omits their citations',()=>{
 assert.deepEqual(responsePaths('Explain this topic',{citations:['c.tex'],sources:[{path:'b.tex'},{path:'a.tex'},{path:'b.tex'}]},graph),['b.tex','a.tex','c.tex']);
});

test('computed paths override other retrieved files and remain the exact foreground set',()=>{
 const reply={citations:['unrelated.tex'],sources:[{path:'isolated.tex'}],concept_path:{paths:['a.tex','b.tex','c.tex'],found:true}};
 const paths=responsePaths('How does A connect to C?',reply,graph);assert.deepEqual(paths,['a.tex','b.tex','c.tex']);
 const result=sceneGraph(graph,{paths,proposal:null,exactPath:true});assert.deepEqual(result.focusPaths,paths);assert.equal(result.documents.length,graph.documents.length);
});
