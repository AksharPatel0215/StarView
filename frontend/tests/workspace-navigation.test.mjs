import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/workspaceNavigation.ts',import.meta.url),'utf8');
const {closePagePlan}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('closing inactive tabs leaves the current page alone',()=>{assert.deepEqual(closePagePlan(['a','b'],'a','b'),{tabs:['a'],next:null});});
test('closing an active page chooses its neighbor, then home when no pages remain',()=>{
 assert.deepEqual(closePagePlan(['a','b','c'],'b','b'),{tabs:['a','c'],next:'a'});
 assert.deepEqual(closePagePlan(['a','b'],'a','a'),{tabs:['b'],next:'b'});
 assert.deepEqual(closePagePlan(['a'],'a','a'),{tabs:[],next:'@home'});
});
