import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/knowledgeHierarchy.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {hierarchyNotes,hierarchyMatches}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const node=(id,title,targets)=>({id,title,kind:'dashboard',targets});
test('nested topics count shared notes once, ignore missing targets, and survive cycles',()=>{
 const root=node('root','Math',['a','b']);const a=node('a','Algebra',['shared.tex','missing.tex','root']);const b=node('b','Geometry',['shared.tex','other.tex']);
 const docs=[{path:'shared.tex',title:'Contraction theorem'},{path:'other.tex',title:'Modulus'}];
 assert.deepEqual([...hierarchyNotes(root,[root,a,b],docs)].sort(),['other.tex','shared.tex']);
 assert.equal(hierarchyMatches(root,[root,a,b],docs,'contraction'),true);
 assert.equal(hierarchyMatches(root,[root,a,b],docs,'unknown'),false);
});
