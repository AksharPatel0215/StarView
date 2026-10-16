import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/panelLayout.ts',import.meta.url),'utf8');
const {restoreTools,addTool}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('empty workspace and distinct tool order survive restoration',()=>{for(const tools of [[],['agent'],['graph','latex'],['latex','agent','graph']])assert.deepEqual(restoreTools(JSON.stringify(tools)),tools);});
test('invalid, duplicate or oversized tool configurations recover safely',()=>{for(const value of [null,'bad','["write"]','["graph","graph"]','["graph","agent","latex","graph"]'])assert.deepEqual(restoreTools(value),['latex','graph']);});
test('add tool keeps one of each and never exceeds three windows',()=>{let tools=[];for(const tool of ['latex','agent','graph','latex','agent'])tools=addTool(tools,tool);assert.deepEqual(tools,['latex','agent','graph']);assert.deepEqual(addTool(['graph'],'latex'),['graph','latex']);});
