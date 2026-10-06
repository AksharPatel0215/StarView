import { useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import {usePreferences,themes} from '../preferences';
import { linkContext,linkSuggestions } from '../linkSuggestions';
import type { LinkDocument } from '../linkSuggestions';

globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
if(!monaco.languages.getLanguages().some(language=>language.id==='latex'))monaco.languages.register({id:'latex'});
export default function LocalEditor({documents,documentPath,onMount,...props}:EditorProps&{documents:LinkDocument[];documentPath:string}) {
  const {preferences}=usePreferences();
  const theme=themes.find(item=>item.id===preferences.theme)||themes[0];
  const editorInstance=useRef<monaco.editor.IStandaloneCodeEditor|null>(null);
  useEffect(()=>{monaco.editor.defineTheme("starview-preferences",{base:theme.light?"vs":"vs-dark",inherit:true,rules:[],colors:{"editor.background":theme.id==='night'?'#191d26':theme.colors.surface,"editor.foreground":theme.colors.text,"editorLineNumber.foreground":theme.colors.muted,"editor.selectionBackground":theme.colors.accent+'40',"editor.lineHighlightBackground":theme.colors.raised}});if(editorInstance.current)monaco.editor.setTheme("starview-preferences");},[theme]);
  const current=useRef({documents,documentPath});current.current={documents,documentPath};
  const provider=useRef<monaco.IDisposable|null>(null);
  useEffect(()=>()=>{provider.current?.dispose();},[]);
  return <Editor {...props} theme="starview-preferences" onMount={(editor,api)=>{
    editorInstance.current=editor;
    api.editor.setTheme("starview-preferences");
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
