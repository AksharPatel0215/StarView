/** Repair only the known missing-title error, keeping the repair in the reviewable source. */
export function prepareDraft(source:string,path:string):string{
 const active=source.replace(/(?<!\\)%[^\n]*/g,'');
 if(!/\\maketitle\b/.test(active)||/\\title\s*(?:\[[^\]]*\])?\s*\{/.test(active))return source;
 const title=(path.split('/').pop()||'Draft note').replace(/\.tex$/i,'').replace(/[-_]+/g,' ').replace(/[^\p{L}\p{N} ]/gu,'').trim()||'Draft note';
 return source.replace(/\\begin\s*\{document\}/,`\\title{${title.charAt(0).toUpperCase()+title.slice(1)}}\n\\begin{document}`);
}
export function draftError(log:string):string{
 const error=log.match(/^!\s*(.+)/m),line=log.match(/^l\.(\d+)\s*(.*)/m);
 return error?`${error[1]}${line?` (line ${line[1]}: ${line[2].trim()})`:''} Switch to Code to correct the draft.`:log;
}
