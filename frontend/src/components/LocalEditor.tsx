import { useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { linkContext,linkSuggestions } from '../linkSuggestions';
import type { LinkDocument } from '../linkSuggestions';

globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
if(!monaco.languages.getLanguages().some(language=>language.id==='latex'))monaco.languages.register({id:'latex'});
export default function LocalEditor({documents,documentPath,onMount,...props}:EditorProps&{documents:LinkDocument[];documentPath:string}) {
  const current=useRef({documents,documentPath});current.current={documents,documentPath};
  const provider=useRef<monaco.IDisposable|null>(null);
  useEffect(()=>()=>{provider.current?.dispose();},[]);
  return <Editor {...props} onMount={(editor,api)=>{
    provider.current?.dispose();
    provider.current=api.languages.registerCompletionItemProvider('latex',{
      triggerCharacters:['['],
      provideCompletionItems(model: monaco.editor.ITextModel,position: monaco.IPosition){
        if(editor.getModel()!==model)return {suggestions:[]};
        const context=linkContext(model.getValue(),model.getOffsetAt(position));
        if(!context)return {suggestions:[]};
        const start=model.getPositionAt(context.start),end=model.getPositionAt(context.end);
        const range=new api.Range(start.lineNumber,start.column,end.lineNumber,end.column);
        return {suggestions:linkSuggestions(current.current.documents,current.current.documentPath,context.query).map(doc=>({
          label:{label:doc.title,description:doc.path},detail:doc.path,kind:api.languages.CompletionItemKind.Reference,
          insertText:doc.insertText,range,filterText:`${context.query} ${doc.title} ${doc.path}`,sortText:doc.title,
        }))};
      },
    });
    onMount?.(editor,api);
  }}/>;
}
