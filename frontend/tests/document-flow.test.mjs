import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/documentFlow.ts',import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;const {DocumentSaveQueue,moveDestination}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('late autosave finishes before a newer navigation save and cannot overwrite it',async()=>{
 const queue=new DocumentSaveQueue(),events=[];let release;
 const old=queue.save('project:file',()=>new Promise(resolve=>{events.push('old');release=resolve;}));
 const newer=queue.save('project:file',async()=>{events.push('new');});
 await Promise.resolve();await Promise.resolve();assert.deepEqual(events,['old']);release();await Promise.all([old,newer]);assert.deepEqual(events,['old','new']);
});
test('a failed save does not permanently block later saves',async()=>{const queue=new DocumentSaveQueue();await assert.rejects(queue.save('file',async()=>{throw new Error('offline');}));let saved=false;await queue.save('file',async()=>{saved=true;});assert.ok(saved);});
test('folder drops keep the filename and support returning to the workspace root',()=>{assert.equal(moveDestination('A/note.tex','B'),'B/note.tex');assert.equal(moveDestination('A/note.tex',''),'note.tex');});
