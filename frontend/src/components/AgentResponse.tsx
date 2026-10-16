import katex from 'katex';
import 'katex/dist/katex.min.css';
import {splitAnswer} from '../agentMath';
function MathFormula({source,display=false}:{source:string;display?:boolean}){
 try{
  const html=katex.renderToString(source,{output:'html',displayMode:display,throwOnError:true,trust:false,strict:'ignore',maxExpand:500,maxSize:20,macros:{}});
  // Only KaTeX-generated markup is inserted. Model text never becomes raw HTML.
  return <span role="math" aria-label={source} className={display?'agent-math-block':'agent-math-inline'} dangerouslySetInnerHTML={{__html:html}}/>;
 }catch{return <code className={display?'agent-math-fallback agent-math-block':'agent-math-fallback'}>{source}</code>;}
}
export default function AgentResponse({content}:{content:string}){
 return <>{splitAnswer(content).map((part,index)=>part.kind==='math'?<MathFormula key={index} source={part.value} display={part.display}/>:part.kind==='code'?(part.display?<pre className="agent-answer-code" key={index}><code>{part.value}</code></pre>:<code key={index}>{part.value}</code>):<span key={index}>{part.value}</span>)}</>;
}
