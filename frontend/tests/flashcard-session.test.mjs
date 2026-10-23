import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/flashcardSession.ts',import.meta.url),'utf8');
const {cardLabels,practiceScore}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('labels trim and deduplicate without destroying multiword topics',()=>{assert.deepEqual(cardLabels(' Derivatives, , Complex roots, Derivatives '),['Derivatives','Complex roots']);assert.deepEqual(cardLabels(''),[]);});
test('score counts each session card once and supports a missed-card retry',()=>{
 const ids=['a','b','c'];assert.deepEqual(practiceScore(ids,{a:true}),{answered:1,correct:1,total:3,complete:false,missed:[]});
 const score=practiceScore(ids,{a:true,b:false,c:true,other:true});assert.equal(score.correct,2);assert.equal(score.answered,3);assert.equal(score.complete,true);assert.deepEqual(score.missed,['b']);
 assert.equal(practiceScore(score.missed,{b:true}).correct,1);assert.equal(practiceScore([],{a:true}).complete,false);
});
