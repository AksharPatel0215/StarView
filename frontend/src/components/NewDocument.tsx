import { useState } from 'react';
import useDialog from './useDialog';
export default function NewDocument({files,folder,busy,onSave,onClose}:{files:string[];folder:string;busy:boolean;onSave:(path:string,content:string)=>Promise<void>;onClose:()=>void}) {
  const [name,setName]=useState('');const [directory,setDirectory]=useState(folder);const [error,setError]=useState('');
  const ref=useDialog(onClose);
  const folders=Array.from(new Set(['',folder,...files.flatMap(path=>{const parts=path.split('/');return parts.slice(0,-1).map((_,index)=>parts.slice(0,index+1).join('/'));})])).sort();
  async function create(){
    const filename=name.trim().replace(/\.tex$/i,'')+'.tex';const path=(directory?directory+'/':'')+filename;
    if(!name.trim()||filename.split('/').some(part=>!part||part.startsWith('.'))||/[\\[\]|]/.test(filename)){setError('Choose a document name. You can include a new subfolder, such as Examples/first-example.');return;}
    if(files.includes(path)){setError('That file already exists. Choose another name.');return;}
    const title=filename.split('/').pop()!.slice(0,-4).replace(/[-_]/g,' ').replace(/[\\&%$#_{}~^]/g,char=>({'\\':'\\textbackslash{}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[char]||`\\${char}`));
    const content=`\\documentclass[11pt]{article}\n\\usepackage{amsmath,amssymb,amsthm,graphicx,geometry,hyperref}\n\\geometry{margin=1in}\n\\title{${title}}\n\\author{}\n\\date{}\n\\begin{document}\n\\maketitle\n\n\\section{Notes}\nStart writing here.\n\n% Type [[ to link another document.\n\n\\end{document}\n`;
    setError('');try{await onSave(path,content);}catch(e){setError(e instanceof Error?e.message:'Could not create document.');}
  }
  return <div className="modal-backdrop"><section ref={ref} className="folder-browser new-document" role="dialog" aria-modal="true" aria-labelledby="new-document-title"><h2 id="new-document-title">New LaTeX document</h2><p>A ready-to-compile page, connected to your workspace.</p><form onSubmit={e=>{e.preventDefault();void create();}}><label htmlFor="document-name">Document name</label><input id="document-name" value={name} disabled={busy} maxLength={240} placeholder="My new idea" onChange={e=>setName(e.target.value)}/><label htmlFor="document-folder">Folder</label><select id="document-folder" disabled={busy} value={directory} onChange={e=>setDirectory(e.target.value)}>{folders.map(path=><option key={path} value={path}>{path||'Workspace root'}</option>)}</select><p className="project-root">The .tex extension is added automatically. Use a name such as Examples/first-example to create a subfolder.</p>{error&&<p className="error" role="alert">{error}</p>}<div className="browser-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!name.trim()}>{busy?'Creating…':'Create document'}</button></div></form></section></div>;
}
