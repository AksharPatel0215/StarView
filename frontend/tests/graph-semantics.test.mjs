import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const src=fs.readFileSync(new URL('../src/graphSemantics.ts',import.meta.url),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {graphKind,graphShape,graphKinds,graphDepth,relationshipDash,graphForDisplay}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('semantic tags distinguish topics, sections, and mathematical content',()=>{
 const n={path:'a.tex',tags:[],kind:'document'};assert.equal(graphKind(n),'idea');
 for(const kind of graphKinds)assert.equal(graphKind({...n,tags:['graph-role:'+kind]}),kind);
 assert.equal(graphKind({...n,path:'A/index.tex'}),'section');
 assert.equal(new Set(graphKinds.map(k=>graphShape(k,10))).size,graphKinds.length-1);
});
test('context is painted first and selection last',()=>{
 const foreground=new Set(['neighbor','selected']);const preview=new Set(['preview']);
 const sorted=['selected','neighbor','context','preview'].sort((a,b)=>graphDepth(a,'selected',foreground,preview)-graphDepth(b,'selected',foreground,preview));
 assert.deepEqual(sorted,['context','preview','neighbor','selected']);
});
test('link strokes distinguish derivation, example, and structure',()=>{
 assert.equal(relationshipDash({labels:['used in proof']}),'5 3');
 assert.equal(relationshipDash({labels:['illustrated by']}),'1 3');
 assert.equal(relationshipDash({labels:['contains section']}),undefined);
});

test('workspace nodes are solid circles rather than hollow rings',()=>{
 assert.equal(graphShape('workspace',10),graphShape('idea',10));
});
test('topic map guides and their edges are omitted without removing content notes',()=>{
 const documents=[{path:'overview.tex',title:'Mathematics: Topic Map'},{path:'root/index.tex',title:'Root Finding: Topic Map'},{path:'newton.tex',title:'Newton Maps'},{path:'secant.tex',title:'Secant Method'}];
 const graph={documents,links:[{source:'overview.tex',target:'newton.tex'},{source:'newton.tex',target:'secant.tex'}]};
 const result=graphForDisplay(graph);
 assert.deepEqual(result.documents.map(n=>n.path),['newton.tex','secant.tex']);
 assert.deepEqual(result.links,[graph.links[1]]);
 assert.equal(graph.documents.length,4);
});
