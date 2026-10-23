import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/graphInteraction.ts',import.meta.url),'utf8');
const {foregroundRelationship,uniqueRelationships}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('candidates expose only their originating anchor relationship',()=>{
 const foreground=new Set(['selected','anchor','neighbor']),candidates=new Set(['candidate','other-candidate']);
 const allowed=(source,target)=>foregroundRelationship({source,target},foreground,candidates,'anchor');
 assert.equal(allowed('selected','neighbor'),true);
 assert.equal(allowed('anchor','candidate'),true);assert.equal(allowed('candidate','anchor'),true);
 assert.equal(allowed('candidate','neighbor'),false);assert.equal(allowed('candidate','other-candidate'),false);
 assert.equal(allowed('candidate','background'),false);assert.equal(allowed('anchor','background'),false);
 assert.equal(foregroundRelationship({source:'candidate',target:'neighbor'},new Set(['candidate','neighbor']),new Set(),''),true);
});

test('reciprocal connections render once with merged labels and no mutation',()=>{
 const edges=[{source:'a',target:'b',missing:false,labels:['prerequisite']},{source:'b',target:'a',missing:false,labels:['related']},{source:'b',target:'c',missing:false,labels:[]}];const before=JSON.stringify(edges);const result=uniqueRelationships(edges);
 assert.equal(result.length,2);assert.equal(result[0].reciprocal,true);assert.deepEqual(result[0].labels,['prerequisite','related']);assert.equal(result[1].reciprocal,false);assert.equal(JSON.stringify(edges),before);
});
