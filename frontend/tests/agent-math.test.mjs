import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import katex from 'katex';
const source=readFileSync(new URL('../src/agentMath.ts',import.meta.url),'utf8');
const {splitAnswer}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('mixed inline and display equations retain surrounding prose',()=>{
 const parts=splitAnswer(String.raw`For \(z=x+iy\), use $$u_x=v_y$$ and $u_y=-v_x$.`);
 assert.deepEqual(parts.filter(p=>p.kind==='math').map(p=>[p.value,p.display]),[['z=x+iy',false],['u_x=v_y',true],['u_y=-v_x',false]]);
 assert.equal(parts[0].value,'For ');
});
test('bare formulas and latex fences render, ordinary code and currency stay literal',()=>{
 assert.equal(splitAnswer(String.raw`\boxed{f'(z)=u_x+iv_x}`)[0].kind,'math');
 assert.equal(splitAnswer('```latex\n\\frac{1}{z}\n```')[0].kind,'math');
 assert.equal(splitAnswer('```js\nconst x="$math$";\n```')[0].kind,'code');
 assert.equal(splitAnswer('Costs $5 or $10.').some(p=>p.kind==='math'),false);
});
test('math environments render and unmatched delimiters remain readable',()=>{
 assert.equal(splitAnswer(String.raw`\begin{align}a&=b\\c&=d\end{align}`)[0].kind,'math');
 assert.equal(splitAnswer(String.raw`unfinished \[x`)[0].value,String.raw`unfinished \[x`);
 assert.match(katex.renderToString(String.raw`\frac{1}{z}`,{trust:false}),/class="katex"/);
 assert.doesNotMatch(katex.renderToString(String.raw`\href{javascript:alert(1)}{x}`,{trust:false,throwOnError:false}),/href="javascript:/);
});
test('undelimited roots in prose retain balanced formulas and remove control artifacts',()=>{
 const answer=String.raw`&#3; Roots are given by \boxed{z_k = r^{1/n} \left(\cos\left(\frac{\theta + 2k\pi}{n}\right) + i\sin\left(\frac{\theta + 2k\pi}{n}\right)\right)} for k = 0. Radius r^{1/n}, angle \frac{2k\pi}{n}.`;
 const parts=splitAnswer(answer),math=parts.filter(p=>p.kind==='math');
 assert.equal(math.length,3);
 for(const part of math)assert.match(katex.renderToString(part.value,{throwOnError:true}),/class="katex"/);
 assert.equal(parts[0].value,' Roots are given by ');
 assert.match(parts.map(p=>p.value).join(''),/for k = 0/);
 assert.doesNotMatch(parts.map(p=>p.value).join(''),/&#3;/);
});
test('HTML entities become readable text without inserting model HTML',()=>{
 assert.equal(splitAnswer('&nbsp;A &lt; B &amp; C').map(p=>p.value).join(''),' A < B & C');
});
