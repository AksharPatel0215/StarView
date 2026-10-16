import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/draftSource.ts',import.meta.url),'utf8');
const {prepareDraft,draftError}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('missing title repair is reviewable, repeatable and preserves existing titles',()=>{
 const draft=String.raw`\documentclass{article}\begin{document}\maketitle Content\end{document}`;
 const fixed=prepareDraft(draft,'Geometry/nth-roots.tex');
 assert.match(fixed,/\\title\{Nth roots\}/);assert.equal(prepareDraft(fixed,'a.tex'),fixed);
 assert.equal(prepareDraft(draft.replace('\\maketitle',''),'a.tex'),draft.replace('\\maketitle',''));
});
test('compiler error shows useful message and source line without startup logs',()=>{
 assert.equal(draftError('Latexmk startup\n! LaTeX Error: No \\title given.\nl.8 \\maketitle\nFatal error'),'LaTeX Error: No \\title given. (line 8: \\maketitle) Switch to Code to correct the draft.');
});
