import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/dashboardSections.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {dashboardSections}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const doc=(path,title,kind='document')=>({path,title,kind,tags:[],is_main:true});
test('dashboard cards follow the connected section guides and group their own notes',()=>{
 const docs=[doc('A/index.tex','First'),doc('A/one.tex','One'),doc('B/index.tex','Second'),doc('B/two.tex','Two'),doc('@node/hub','Hub','dashboard')];
 const cards=dashboardSections(docs,['B/index.tex','A/index.tex']);
 assert.deepEqual(cards.map(card=>card.guide.title),['Second','First']);
 assert.deepEqual(cards[0].notes.map(note=>note.path),['B/two.tex']);
 assert.equal(dashboardSections(docs,['A/index.tex']).length,1);
 assert.equal(dashboardSections(docs,[]).length,0);
});
