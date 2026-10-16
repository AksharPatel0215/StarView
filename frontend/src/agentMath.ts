export type AnswerPart={kind:'text'|'math'|'code';value:string;display?:boolean};
/** Explicit math delimiters take priority; code and ordinary dollar amounts stay literal. */
export function splitAnswer(source:string):AnswerPart[]{
 source=source.replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,entity=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'\"','&apos;':"'"}[entity]??entity));
 source=source.replace(/&#(?:x0*3|0*3);?/gi,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
 const parts:AnswerPart[]=[];
 const pattern=/```([^\n]*)\n([\s\S]*?)```|\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<![\\\w])\$(?![\d\s])([^\n$]+?)\$(?!\d)|\\begin\{(equation\*?|align\*?|gather\*?|aligned)\}[\s\S]*?\\end\{\7\}|`([^`\n]+)`/g;
 function text(value:string){
  // Extract balanced TeX atoms without swallowing surrounding prose.
  const atoms=/\\[a-zA-Z]+|\b[a-zA-Z](?:_[a-zA-Z0-9]|\^\{|_\{)/g;
  let cursor=0;
  for(let match=atoms.exec(value);match;match=atoms.exec(value)){
   const start=match.index;let stop=start;
   if(value[start]==='\\'){
    stop=start+match[0].length;
    for(;;){
     let next=stop;while(value[next]===' ')next++;
     if(value[next]!=='{')break;
     let depth=0,finish=next;
     for(;finish<value.length;finish++){
      if(value[finish]==='{'&&value[finish-1]!=='\\')depth++;
      if(value[finish]==='}'&&value[finish-1]!=='\\'&&--depth===0){finish++;break;}
     }
     if(depth!==0)break;
     stop=finish;
    }
   }else{
    stop=start+1;
    while(value[stop]==='^'||value[stop]==='_'){
     stop++;
     if(value[stop]==='{'){
      let depth=1;stop++;
      while(stop<value.length&&depth){if(value[stop]==='{')depth++;if(value[stop]==='}')depth--;stop++;}
     }else if(stop<value.length)stop++;
    }
   }
   if(start>cursor)parts.push({kind:'text',value:value.slice(cursor,start)});
   parts.push({kind:'math',value:value.slice(start,stop),display:match[0]==='\\boxed'});
   cursor=stop;atoms.lastIndex=stop;
  }
  if(cursor<value.length)parts.push({kind:'text',value:value.slice(cursor)});
 }
 let end=0;
 for(const match of source.matchAll(pattern)){
  text(source.slice(end,match.index));
  if(match[8]!==undefined)parts.push({kind:'code',value:match[8],display:false});
  else if(match[1]!==undefined){const language=match[1].trim().toLowerCase();parts.push({kind:['latex','tex','math'].includes(language)?'math':'code',value:match[2],display:true});}
  else parts.push({kind:'math',value:match[3]??match[4]??match[5]??match[6]??match[0],display:match[5]===undefined&&match[6]===undefined});
  end=match.index!+match[0].length;
 }
 text(source.slice(end));return parts;
}
