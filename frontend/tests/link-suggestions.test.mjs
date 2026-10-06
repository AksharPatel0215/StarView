import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
const parser=ts.transpileModule(fs.readFileSync(new URL('../src/documentLinks.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const parserUrl='data:text/javascript;base64,'+Buffer.from(parser).toString('base64');
const code=ts.transpileModule(fs.readFileSync(new URL('../src/linkSuggestions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText.replace("'./documentLinks'",JSON.stringify(parserUrl));
const {linkContext,linkSuggestions,relativeLink}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('open brackets trigger, queries replace existing closing brackets, aliases do not trigger',()=>{
 assert.deepEqual(linkContext('[[',2),{start:2,end:2,query:''});
 assert.deepEqual(linkContext('See [[geo]]',9),{start:6,end:11,query:'geo'});
 assert.equal(linkContext('[[geo|label',11),null);assert.equal(linkContext('[[done]]',8),null);
});
test('comments and literal LaTeX do not offer links',()=>{
 for(const content of ['% [[','\\begin{verbatim}\n[[','\\verb|[[|'])assert.equal(linkContext(content,content.indexOf('[[')+2),null);
 assert.ok(linkContext('escaped \\% [[',13));
});
test('duplicate filenames use exact relative paths and templates close the link',()=>{
 const docs=[{path:'Geometry/index.tex',title:'Geometry'},{path:'Algebra/index.tex',title:'Algebra'},{path:'main.tex',title:'Course Home'},{path:'@node/abc',title:'Dashboard',kind:'dashboard'}];
 assert.equal(relativeLink('Geometry/argument.tex','Algebra/index.tex'),'../Algebra/index');
 assert.equal(linkSuggestions(docs,'Geometry/index.tex','algebra')[0].insertText,'../Algebra/index|Algebra]]');
 assert.equal(linkSuggestions(docs,'Geometry/index.tex','').length,2);
 assert.equal(linkSuggestions(docs,'main.tex','geometry')[0].path,'Geometry/index.tex');
});
