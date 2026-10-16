import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/nodeAppearance.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {nodeRole,nodeRadius,pulseProfile}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const note={path:'Geometry/argument.tex',tags:[],kind:'document'};
const section={...note,path:'Geometry/index.tex',tags:['overview']};
const hub={...note,path:'@node/hub',kind:'dashboard'};
test('labels override inferred node category',()=>{
 assert.equal(nodeRole(hub),'workspace');assert.equal(nodeRole(section),'section');assert.equal(nodeRole(note),'note');
 assert.equal(nodeRole({...section,tags:['overview','note']}),'note');
 assert.equal(nodeRole({...note,tags:['section']}),'section');
});
test('size hierarchy stays dramatic even between highly connected notes and quiet hubs',()=>{
 for(const mode of ['background','preview','foreground']){
  assert.ok(nodeRadius(hub,0,mode)>nodeRadius(section,100,mode));
  assert.ok(nodeRadius(section,0,mode)>nodeRadius(note,100,mode));
  assert.ok(nodeRadius(note,20,mode)>nodeRadius(note,1,mode));
 }
});
test('size pulse ranges and periods vary across stars without changing on each render',()=>{
 const a=pulseProfile('a',5),b=pulseProfile('b',5);
 assert.deepEqual(a,pulseProfile('a',5));assert.notEqual(a.duration,b.duration);assert.notEqual(a.high,b.high);
 assert.ok(a.low<1&&a.high>1);assert.ok(a.high<1.5);assert.ok(a.duration>3);
});
