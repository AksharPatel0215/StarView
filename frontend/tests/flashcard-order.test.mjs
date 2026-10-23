import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/flashcardOrder.ts',import.meta.url),'utf8');
const {shuffleCards}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('shuffle retains every card once and never mutates the saved order',()=>{
 const original=['a','b','c','d'];const next=shuffleCards(original,()=>0);
 assert.deepEqual(original,['a','b','c','d']);assert.deepEqual([...next].sort(),original);assert.notDeepEqual(next,original);
 assert.deepEqual(shuffleCards([],()=>0),[]);assert.deepEqual(shuffleCards(['one'],()=>0),['one']);
});
