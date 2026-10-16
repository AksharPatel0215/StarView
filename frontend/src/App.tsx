import { Fragment, lazy, Suspense, useEffect, useRef, useState } from "react";
const Editor = lazy(() => import("./components/LocalEditor"));
import { labelConnection, setGraphColor, chooseFolder, getTags, updateTags, browseDirectories, compileProjectFile, getPdfUrl, getConnections, connectDocuments, getAssetUrl, getProjectFile, getProjectFiles, getProjects, openProject, saveProjectFile } from "./api/client";
import type { FileLabels, DirectoryListing, Project, KnowledgeGraph } from "./api/client";
import FileActionsDialog from "./components/FileActionsDialog";
import Trash from "./components/Trash";
import {moveFile,deleteFile} from "./api/client";
import {DocumentSaveQueue,moveDestination} from './documentFlow';
import AgentPanel from './components/AgentPanel';
import ToolDivider from './components/ToolDivider';
import ToolPicker from './components/ToolPicker';
import {restoreTools,addTool,toolNames} from './panelLayout';
import type {PanelMode,Tool} from './panelLayout';
import Settings from "./components/Settings";
import {usePreferences} from "./preferences";
import CompactMenu from "./components/CompactMenu";
import NewDocument from "./components/NewDocument";
import { createProjectFile } from "./api/client";
import FileTree from "./components/FileTree";
import Connections from "./components/Connections";
import Dashboard from "./components/Dashboard";
import DataViewer from "./components/DataViewer";
import NodeManager from "./components/NodeManager";

import { getWorkspaceNodes, createWorkspaceNode, updateWorkspaceNode } from "./api/client";

import type { WorkspaceNode } from "./api/client";
import { wikiLinks } from "./documentLinks";
const PdfPreview = lazy(() => import("./components/PdfPreview"));

const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";

function App() {
  const {preferences}=usePreferences();
  const [fileAction,setFileAction]=useState<{path:string;mode:"move"|"delete"}|null>(null);
  const [trashOpen,setTrashOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [accountNotice,setAccountNotice]=useState(()=>{const result=new URLSearchParams(window.location.search).get('account');return result==='connected'?'Account connected. Add a data node to choose a resource.':result==='failed'?'Account connection was not completed. Try again, or check the provider setup.':'';});
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('account')){const url=new URL(window.location.href);url.searchParams.delete('account');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}},[]);
  const [nodes,setNodes] = useState<WorkspaceNode[]>([]);
  const [activeNode,setActiveNode] = useState<WorkspaceNode|null>(null);
  const [center,setCenter] = useState<'editor'|'dashboard'|'data'>('dashboard');
  const [nodeEditor,setNodeEditor] = useState<{kind:'dashboard'|'data';node:WorkspaceNode|null}|null>(null);
  const [statsVersion,setStatsVersion] = useState(0);
  const [,setTabs] = useState<string[]>([]);
  const [layout,setLayout] = useState(() => {
    const defaults={sidebar:true,editor:true,preview:false,sidebarWidth:250,previewWidth:430};
    try {const saved=JSON.parse(localStorage.getItem('starview-layout')||'null');return saved?{sidebar:!!saved.sidebar,editor:saved.editor!==false,preview:!!saved.preview,sidebarWidth:Math.max(180,Math.min(420,Number(saved.sidebarWidth)||250)),previewWidth:Math.max(280,Math.min(800,Number(saved.previewWidth)||430))}:defaults;}catch{return defaults;}
  });
  useEffect(()=>{localStorage.setItem('starview-layout',JSON.stringify(layout));},[layout]);

  async function reloadNodes(){if(project)setNodes(await getWorkspaceNodes(project.name));}
  async function openNode(path:string){openTool('latex');const node=nodes.find(item=>item.id===path);if(node){if(dirty&&project){try{await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}catch(e){setError(message(e));return;}}setActiveNode(node);setCenter(node.kind==='dashboard'?'dashboard':'data');setLayout(current=>({...current,editor:true}));}else{void selectFile(path);}}
  async function saveNode(value:{title:string;kind:'dashboard'|'data';targets:string[];resource?:{provider:string;id:string}}){if(!project)return;const next=nodeEditor?.node?await updateWorkspaceNode(project.name,{...nodeEditor.node,title:value.title,targets:value.targets}):await createWorkspaceNode(project.name,value);await reloadNodes();loadGraph(await getConnections(project.name));setActiveNode(next);setCenter(next.kind==='dashboard'?'dashboard':'data');setStatsVersion(current=>current+1);}
  const [tags, setTags] = useState<FileLabels>({});
  const [fileSearch, setFileSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [rendering, setRendering] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  useEffect(()=>{let active=true;setNodes([]);setActiveNode(null);setCenter('dashboard');setTabs([]);if(project)getWorkspaceNodes(project.name).then(value=>{if(active)setNodes(value);}).catch(e=>setError(message(e)));return()=>{active=false;};},[project]);
  const [graph, setGraph] = useState<KnowledgeGraph>({ documents: [], links: [] });
  const [newDocument,setNewDocument] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [tools,setTools]=useState(()=>restoreTools(localStorage.getItem('starview-tools')));
  const [toolWidths,setToolWidths]=useState<Record<Tool,number>>(()=>{try{const v=JSON.parse(localStorage.getItem('starview-tool-widths')||'{}');return {latex:Number(v.latex)>0?Number(v.latex):1,agent:Number(v.agent)>0?Number(v.agent):1,graph:Number(v.graph)>0?Number(v.graph):1};}catch{return {latex:1,agent:1,graph:1};}});
  const [latexMode,setLatexMode]=useState<'read'|'write'>(()=>localStorage.getItem('starview-latex-mode')==='read'?'read':'write');
  const [toolPicker,setToolPicker]=useState(false);
  const reading=tools.includes('latex')&&latexMode==='read';
  const view=reading?'page':'write';
  function openTool(tool:Tool){setTools(previous=>addTool(previous,tool));setToolPicker(false);}
  function setView(mode:'write'|'page'){openTool('latex');setLatexMode(mode==='page'?'read':'write');}
  useEffect(()=>{localStorage.setItem('starview-tools',JSON.stringify(tools));localStorage.setItem('starview-tool-widths',JSON.stringify(toolWidths));localStorage.setItem('starview-latex-mode',latexMode);},[tools,toolWidths,latexMode]);
  const [renderedSource,setRenderedSource]=useState("");
  const renderRequest=useRef(0);
  const renderCache=useRef(new Map<string,{content:string;pdf:string;version:number}>());


  const [assetPath, setAssetPath] = useState("");

  const [status, setStatus] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [pdfVersion, setPdfVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [directoryPath, setDirectoryPath] = useState("");
  const [browserError, setBrowserError] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const saveQueue=useRef(new DocumentSaveQueue());
  function persistFile(name:string,path:string,content:string){return saveQueue.current.save(name+'::'+path,()=>saveProjectFile(name,path,content)).then(()=>{renderCache.current.clear();});}
  const fileRequest = useRef(0);
  const browseRequest = useRef(0);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.altKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='n'&&project&&!busy&&!loadingFile&&!document.querySelector('[role="dialog"]')){event.preventDefault();setNewDocument(true);}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[project,busy,loadingFile]);
  const dirty = selectedFile !== "" && fileContent !== savedContent;

  useEffect(() => { getProjects().then(value=>{setProjects(value);const remembered=localStorage.getItem('starview-project');const next=value.find(item=>item.name===remembered);if(next)void selectProject(next);}).catch(e => setError(message(e))); }, []);

  useEffect(() => {
    let active = true;
    setTags({}); setTagFilter(""); setFileSearch("");
    if (project) getTags(project.name).then(value => { if (active) setTags(value); }).catch(e => setError(message(e)));
    return () => { active = false; };
  }, [project]);

  async function editTags(values: string[]) {
    const path = selectedFile || assetPath || pdfPath;
    if (!project || !path || busy) return;
    setBusy(true); setError("");
    try { setTags(await updateTags(project.name, path, values)); loadGraph(await getConnections(project.name)); setTagDraft(""); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function pickFolder() {
    if (!canLeave() || busy) return;
    setBusy(true); setError("");
    try {
      const result = await chooseFolder();
      if (result.path) await openFolder(result.path);
    } catch (e) { setError(message(e)); setShowBrowser(true); void browse(project?.root); }
    finally { setBusy(false); }
  }

  function loadGraph(next:KnowledgeGraph,_reset=false){setGraph(next);}

  async function refresh() {
    if (!project || busy) return;
    setBusy(true); setError("");
    try {
      const [nextFiles, nextGraph] = await Promise.all([getProjectFiles(project.name), getConnections(project.name)]);
      setFiles(nextFiles); loadGraph(nextGraph); await reloadNodes(); setStatsVersion(current=>current+1); setTags(await getTags(project.name));
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function labelEdge(source: string, target: string, labels: string[], color: string | null) {
    if (!project || busy) return;
    setBusy(true); setError("");
    try { setGraph(await labelConnection(project.name, source, target, labels, color)); setStatus("Relationship saved"); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function colorGraph(kind: "tag" | "relationship" | "node", key: string, color: string | null) {
    if (!project || busy) return;
    setBusy(true); setError("");
    try { setGraph(await setGraphColor(project.name, kind, key, color)); setStatus("Graph color saved"); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function connect(source: string, target: string, remove = false) {
    if (!project || busy) return;
    setBusy(true); setError("");
    try {
      if(source.startsWith('@node/')&&remove){const node=nodes.find(item=>item.id===source);if(!node)throw new Error('Workspace node not found');const updated=await updateWorkspaceNode(project.name,{...node,targets:node.targets.filter(path=>path!==target)});setNodes(current=>current.map(item=>item.id===source?updated:item));if(activeNode?.id===source)setActiveNode(updated);setGraph(await getConnections(project.name));}else setGraph(await connectDocuments(project.name, source, target, remove));
      setStatsVersion(current=>current+1);
      setStatus(remove ? "Connection removed" : "Connection saved");
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  function canLeave() { return !dirty || window.confirm("Discard unsaved changes to this file?"); }

  async function browse(path?: string) {
    const id = ++browseRequest.current;
    setBrowsing(true); setBrowserError("");
    try {
      const next = await browseDirectories(path);
      if (id !== browseRequest.current) return;
      setListing(next); setDirectoryPath(next.path);
    } catch (e) { if (id === browseRequest.current) setBrowserError(message(e)); }
    finally { if (id === browseRequest.current) setBrowsing(false); }
  }

  async function selectProject(next: Project) {
    if (!canLeave()) return;
    setBusy(true); setError("");
    ++fileRequest.current;
    try {
      const [nextFiles, nextGraph] = await Promise.all([getProjectFiles(next.name), getConnections(next.name)]);
      loadGraph(nextGraph, true); setAssetPath(""); setStatus("");
      setProject(next); localStorage.setItem('starview-project',next.name); setFiles(nextFiles);
      setSelectedFile(""); setFileContent(""); setSavedContent(""); setPdfPath("");
      setShowBrowser(false);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); setLoadingFile(false); }
  }

  async function openFolder(chosenPath?: string) {
    const root = chosenPath || listing?.path;
    if (!root || browsing || !canLeave()) return;
    setBusy(true); setBrowserError("");
    try {
      const known = await getProjects();
      let next = known.find(item => item.root === root);
      if (!next) {
        const base = root.split(/[\\/]/).filter(Boolean).pop() || "Root";
        let name = base; let suffix = 2;
        while (known.some(item => item.name === name)) name = `${base} (${suffix++})`;
        next = await openProject(name, root);
      }
      const [nextFiles, nextGraph] = await Promise.all([getProjectFiles(next.name), getConnections(next.name)]);
      loadGraph(nextGraph, true); setAssetPath(""); setStatus("");
      ++fileRequest.current;
      setProjects(await getProjects()); setProject(next); localStorage.setItem('starview-project',next.name); setFiles(nextFiles);
      setSelectedFile(""); setFileContent(""); setSavedContent(""); setPdfPath("");
      setError(""); setShowBrowser(false); setLoadingFile(false);
    } catch (e) { setBrowserError(message(e)); setError(message(e)); }
    finally { setBusy(false); }
  }

  async function actOnFile(target:string,action=fileAction) {
    if(!project||!action)return;
    if(dirty){await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}
    const source=action.path;
    if(action.mode==='move'){
      if(source===target)return;
      const next=await moveFile(project.name,source,target);
      if(selectedFile===source){const content=await getProjectFile(project.name,next.path);setSelectedFile(next.path);setFileContent(content);setSavedContent(content);}
      if(assetPath===source)setAssetPath(next.path);
      setTabs(current=>current.map(path=>path===source?next.path:path));

      setStatus('File moved. Links updated.');
    }else{
      await deleteFile(project.name,source);setTabs(current=>current.filter(path=>path!==source));
      if(source===selectedFile){setSelectedFile('');setFileContent('');setSavedContent('');}
      if(source===assetPath)setAssetPath('');
      setStatus('Moved to trash. Restore it in Settings.');
    }
    setPdfPath('');await refresh();
  }

  async function createDocument(path:string, content:string) {
    if(!project || busy || loadingFile || !canLeave())return;
    setBusy(true);setError("");
    try {
      const created=await createProjectFile(project.name,path,content);
      const id=++fileRequest.current;
      setSelectedFile(created.path);setFileContent(content);setSavedContent(content);setAssetPath("");setPdfPath("");
      setActiveNode(null);setCenter('editor');setView('write');setLayout(current=>({...current,editor:true}));
      setTabs(current=>Array.from(new Set([...current,created.path])));setNewDocument(false);setFileSearch('');setTagFilter('');setStatus('Document created.');
      const [nextFiles,nextGraph,nextTags]=await Promise.all([getProjectFiles(project.name),getConnections(project.name),getTags(project.name)]);
      if(id===fileRequest.current){setFiles(nextFiles);loadGraph(nextGraph);setTags(nextTags);setStatsVersion(current=>current+1);}
    } catch(e) {setError(message(e));throw e;} finally {setBusy(false);}
  }

  async function selectFile(path:string){
    openTool('latex');
    if(path.startsWith('@node/')){openNode(path);return;}
    if(!project||busy||loadingFile)return;
    if(path===selectedFile&&center==='editor')return;
    const id=++fileRequest.current;
    ++renderRequest.current;setLoadingFile(true);setRendering(view==='page'&&path.toLowerCase().endsWith('.tex'));setError('');setStatus('');
    try{
      if(dirty){await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}
      setActiveNode(null);setCenter('editor');setTabs(current=>current.includes(path)?current:[...current,path]);
      setPdfPath('');setRenderedSource('');setAssetPath('');
      if(/\.(png|jpe?g|gif|webp|svg)$/i.test(path)){
        setAssetPath(path);setSelectedFile('');setFileContent('');setSavedContent('');setView('page');
      }else if(path.toLowerCase().endsWith('.pdf')){
        setSelectedFile('');setFileContent('');setSavedContent('');setPdfPath(path);setRenderedSource(path);setPdfVersion(Date.now());setView('page');
      }else{
        const content=await getProjectFile(project.name,path);
        if(id!==fileRequest.current)return;
        setSelectedFile(path);setFileContent(content);setSavedContent(content);
      }
    }catch(e){if(id===fileRequest.current)setError(message(e));}
    finally{if(id===fileRequest.current)setLoadingFile(false);}
  }

  async function followDocument(path:string,render=false){
    if(render)setView('page');
    await selectFile(path);
  }

  function resolveKeyword(target: string): string | undefined {
    const value = target.trim();
    const name = value.toLowerCase().endsWith(".tex") ? value : `${value}.tex`;
    const parent = selectedFile.includes("/") ? selectedFile.slice(0, selectedFile.lastIndexOf("/") + 1) : "";
    const normalize = (path: string) => { const parts: string[] = []; for (const part of path.split("/")) { if (part === "..") { if (!parts.length) return ""; parts.pop(); } else if (part && part !== ".") parts.push(part); } return parts.join("/"); };
    if (value.startsWith("/")) return undefined;
    const exact = graph.documents.find(node => node.path === normalize(parent + name)) || graph.documents.find(node => node.path === normalize(name));
    if (exact) return exact.path;
    const matches = graph.documents.filter(node => node.path.split("/").pop()?.toLowerCase() === name.toLowerCase());
    return !value.includes("/") && matches.length === 1 ? matches[0].path : undefined;
  }

  useEffect(() => {
    const follow = (event: Event) => {
      const target = resolveKeyword((event as CustomEvent<string>).detail);
      if (target) void followDocument(target); else setError("Document link is missing or ambiguous. Use its full project-relative path.");
    };
    window.addEventListener("starview-follow", follow);
    return () => window.removeEventListener("starview-follow", follow);
  });

  async function save(){
    if(!project||!selectedFile||busy||loadingFile)return;
    const content=fileContent,path=selectedFile,id=fileRequest.current;
    try{await persistFile(project.name,path,content);if(id===fileRequest.current){setSavedContent(content);setStatus('Saved');loadGraph(await getConnections(project.name));}}
    catch(e){setError(message(e));}
  }

  useEffect(()=>{
    if(view!=='page'||center!=='editor'||!project||!selectedFile||loadingFile)return;
    const id=++renderRequest.current;let alive=true;
    const key=project.name+'::'+selectedFile,path=selectedFile,content=fileContent;
    setRenderedSource('');setPdfPath('');setError('');
    if(!path.toLowerCase().endsWith('.tex')){setRendering(false);return;}
    const cached=renderCache.current.get(key);
    if(cached?.content===content){setPdfPath(cached.pdf);setPdfVersion(cached.version);setRenderedSource(path);setRendering(false);return;}
    setRendering(true);
    const timer=setTimeout(()=>{void (async()=>{
      try{
        if(content!==savedContent)await persistFile(project.name,path,content);
        const pdf=await compileProjectFile(project.name,path);
        if(!alive||id!==renderRequest.current)return;
        const version=Date.now();renderCache.current.set(key,{content,pdf,version});
        setSavedContent(content);setPdfPath(pdf);setPdfVersion(version);setRenderedSource(path);
      }catch(e){if(alive&&id===renderRequest.current)setError(message(e));}
      finally{if(alive&&id===renderRequest.current)setRendering(false);}
    })();},500);
    return()=>{alive=false;clearTimeout(timer);};
  },[view,center,project,selectedFile,fileContent,savedContent,loadingFile]);

  useEffect(()=>{
    if(!dirty||!project||loadingFile||busy||reading)return;
    const path=selectedFile,content=fileContent,id=fileRequest.current;
    const timer=setTimeout(()=>{void persistFile(project.name,path,content).then(()=>{
      if(fileRequest.current===id){setSavedContent(content);setStatus('Saved');}
      return getConnections(project.name);
    }).then(next=>{if(fileRequest.current===id)loadGraph(next);}).catch(e=>setError(message(e)));},900);
    return()=>clearTimeout(timer);
  },[fileContent,selectedFile,project,dirty,loadingFile,busy,reading]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key==='s'){event.preventDefault();void save();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  async function moveDraggedFile(path:string,folder:string){
    if(busy||loadingFile)return;
    const target=moveDestination(path,folder);
    try{await actOnFile(target,{path,mode:'move'});}catch(e){setError(message(e));}
  }
  const actionPath=selectedFile||assetPath||(pdfPath&&!pdfPath.startsWith(".starview/")?pdfPath:"");
  const activePath = selectedFile || assetPath || pdfPath;
  const activeTags = tags[activePath];
  const visibleFiles = files.filter(file => (!tagFilter || (tags[file] && [tags[file].folder, ...tags[file].custom].includes(tagFilter))) && `${file} ${tags[file]?.custom.join(" ") || ""}`.toLowerCase().includes(fileSearch.trim().toLowerCase()));
  const filteredGraph = tagFilter ? { ...graph, documents: graph.documents.filter(node => node.tags.includes(tagFilter)), links: graph.links.filter(link => graph.documents.find(node => node.path === link.source)?.tags.includes(tagFilter) && graph.documents.find(node => node.path === link.target)?.tags.includes(tagFilter)) } : graph;
  const documents = visibleFiles.filter(file => /\.tex$/i.test(file));
  const resources = visibleFiles.filter(file => /\.(bib|bst|sty|cls|png|jpe?g|gif|webp|svg|eps)$/i.test(file));
  const pdfs = visibleFiles.filter(file => /\.pdf$/i.test(file) && !documents.some(source => source.slice(0, -4) === file.slice(0, -4) || source.split("/").pop()?.slice(0, -4) === file.slice(0, -4)));
  const otherFiles = visibleFiles.filter(file => !documents.includes(file) && !resources.includes(file) && !pdfs.includes(file));

  function renderPanel(mode:PanelMode,visible:boolean) {return <>
    {mode==='graph'&&<div className="pane-graph-holder"><div className="studio-graph"><Connections visible={visible && mode==='graph'} key={(project?.name||'empty')+':graph'} graph={filteredGraph} selected={activeNode?.id||selectedFile} busy={busy||loadingFile} onOpen={openNode} onConnect={(source,target,remove)=>void connect(source,target,remove)} onLabel={labelEdge} onColor={colorGraph}/></div></div>}
    {mode!=='graph'&&(<section className="studio-content" aria-label={`${mode==='write'?'Write':'Read'} document`}>
        <div className="studio-document-bar"><span>{activeNode?.title||graph.documents.find(node=>node.path===actionPath)?.title||actionPath.split('/').pop()?.replace(/\.tex$/,'')||'Workspace'}</span>{activePath&&center==='editor'&&<CompactMenu label="Document details">
          <p className="project-root">{actionPath}</p><button onClick={()=>setFileAction({path:actionPath,mode:'move'})}>Rename / move</button><button onClick={()=>setFileAction({path:actionPath,mode:'delete'})}>Delete</button>
          {activeTags&&<><p>Labels</p><div className="file-tags">{activeTags.custom.map(tag=><button key={tag} onClick={()=>void editTags(activeTags.custom.filter(item=>item!==tag))}>{tag} ×</button>)}<form onSubmit={event=>{event.preventDefault();if(tagDraft.trim())void editTags([...activeTags.custom,tagDraft.trim()]);}}><input aria-label="New tag" value={tagDraft} onChange={event=>setTagDraft(event.target.value)} placeholder="Add label…"/><button disabled={!tagDraft.trim()}>Add</button></form></div></>}
        </CompactMenu>}{activeNode&&<button className="subtle-control" onClick={()=>setNodeEditor({kind:activeNode.kind,node:activeNode})}>{activeNode.kind==='dashboard'?'Edit dashboard':'Edit resource'}</button>}</div>
        {project&&center!=='editor'?center==='data'&&activeNode?<DataViewer project={project.name} node={activeNode} connections={graph.documents.filter(item=>activeNode.targets.includes(item.path))} onOpen={openNode}/>:<Dashboard documents={graph.documents} project={project.name} node={activeNode} refresh={statsVersion} resources={graph.documents.filter(item=>item.kind==='data'&&(!activeNode||activeNode.targets.includes(item.path)))} onOpen={path=>void selectFile(path)}/>:null}
        {mode==='write'&&center==='editor'&&(selectedFile?<div className="editor-body studio-writing"><Suspense fallback={<p className="reader-loading">Opening editor…</p>}><Editor documents={graph.documents} documentPath={selectedFile} height="100%" path={`${project?.name}/${selectedFile}?tool=latex`} language={selectedFile.toLowerCase().endsWith(".tex") ? "latex" : "plaintext"} theme="starview" onMount={(editor, monaco) => {
            function followAt(position: import("monaco-editor").IPosition) {
              const model = editor.getModel(); if (!model) return;
              const offset = model.getOffsetAt(position);
              const link = wikiLinks(model.getValue()).find(link => offset >= link.start && offset <= link.end);
              if (link) window.dispatchEvent(new CustomEvent("starview-follow", { detail: link.target }));
            }
            editor.onMouseDown(event => {
              if (event.target.position && (event.event.ctrlKey || event.event.metaKey)) followAt(event.target.position);
            });
            editor.addAction({ id: "starview.follow-link", label: "Open document link", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => { const position = editor.getPosition(); if (position) followAt(position); } });
          }} value={fileContent} options={{ readOnly: busy || loadingFile, fontSize: preferences.fontSize, lineHeight: Math.round(preferences.fontSize*1.75), minimap: { enabled: false }, padding: { top: 14 }, scrollBeyondLastLine: false, wordWrap: preferences.wordWrap?"on":"off" }} onChange={value => setFileContent(value ?? "")} /></Suspense></div>:<div className="empty-state"><h2>Choose a note to write</h2><p>Open a file from the sidebar.</p></div>)}
        {mode==='read'&&center==='editor'&&<div className="studio-page" aria-busy={rendering||loadingFile}>{loadingFile||rendering?<div className="empty-state" role="status"><span className="loading-orbit"/><p>Preparing {selectedFile.split('/').pop()||'page'}…</p></div>:project&&assetPath?<img className="asset-preview" src={getAssetUrl(project.name,assetPath)} alt={assetPath}/>:project&&pdfPath&&(!selectedFile||renderedSource===selectedFile)?<Suspense fallback={<p className="reader-loading">Opening page…</p>}><PdfPreview key={project.name+':'+renderedSource} url={getPdfUrl(project.name,pdfPath,pdfVersion)} onOpen={path=>void followDocument(path,true)}/></Suspense>:<div className="empty-state"><h2>{error?'This page could not be rendered':'No page to display'}</h2><p>{error?'Switch to Write to check the source.':'Open a LaTeX document or PDF.'}</p></div>}</div>}
        {!project&&<div className="empty-state"><h2>A place for connected ideas</h2><button onClick={()=>void pickFolder()}>Open workspace</button></div>}
        {mode==='write'&&center==='editor'&&<footer className="studio-status" role="status">{loadingFile?'Opening…':dirty?'Saving…':status||'Saved'}<span>⌘/Ctrl S to save · Alt N for a new note</span></footer>}
      </section>)}
  </>;}
  async function agentApplied(paths:string[]) {
    renderCache.current.clear();
    if(project&&selectedFile&&paths.includes(selectedFile)) {const content=await getProjectFile(project.name,selectedFile);setFileContent(content);setSavedContent(content);setPdfPath('');setRenderedSource('');}
    await refresh();
  }

  return <div className="app studio-app">
    <header className="studio-header">
      <button className="sidebar-toggle" aria-label={layout.sidebar?'Hide files':'Show files'} aria-pressed={layout.sidebar} onClick={()=>setLayout(current=>({...current,sidebar:!current.sidebar}))}>☰</button>
      <button className="studio-brand" onClick={()=>{setActiveNode(nodes.find(node=>node.kind==='dashboard')||null);setCenter('dashboard');setView('write');}}>✳ <span>{project?.name||'StarView'}</span></button>
      <div className="workspace-actions">{tools.length>0&&tools.length<3&&<button aria-expanded={toolPicker} onClick={()=>setToolPicker(value=>!value)}>Add tool</button>}</div>
      <button className="settings-toggle" aria-label="Settings" onClick={()=>setSettingsOpen(true)}>⚙</button>
    </header>
    {accountNotice&&<p className="account-notice" role="status">{accountNotice}<button aria-label="Dismiss account notice" onClick={()=>setAccountNotice('')}>×</button></p>}
    {error&&<p className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></p>}
    <main className="studio-workspace">
      {layout.sidebar&&<aside className="sidebar studio-sidebar">
        <div className="sidebar-heading" onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-starview-file'))event.preventDefault();}} onDrop={event=>{event.preventDefault();const path=event.dataTransfer.getData('application/x-starview-file');if(path)void moveDraggedFile(path,'');}}><span>Files</span><button aria-label="New document" disabled={!project||busy||loadingFile} onClick={()=>setNewDocument(true)}>+</button></div>
        {project?<><input className="file-search" type="search" aria-label="Search files" placeholder="Find a note…" value={fileSearch} onChange={e=>setFileSearch(e.target.value)}/>
          {nodes.length>0&&<div className="workspace-node-list">{nodes.map(node=><button key={node.id} className={activeNode?.id===node.id?'active':''} onClick={()=>openNode(node.id)}><span>{node.kind==='dashboard'?'◈':'▤'}</span><span>{node.title}</span></button>)}</div>}
          <FileTree files={documents} selectedFile={selectedFile} onFileSelect={file=>void selectFile(file)} onAction={(path,mode)=>setFileAction({path,mode})} onMove={(path,folder)=>void moveDraggedFile(path,folder)} disabled={busy||loadingFile}/>
          {!documents.length&&<p className="empty-documents">No notes yet. Use + to start.</p>}
          {resources.length>0&&<details className="sidebar-group"><summary>Supporting files</summary><FileTree files={resources} selectedFile={assetPath} onFileSelect={file=>void selectFile(file)} onAction={(path,mode)=>setFileAction({path,mode})} onMove={(path,folder)=>void moveDraggedFile(path,folder)}/></details>}
          {pdfs.length>0&&<details className="sidebar-group"><summary>PDFs</summary><FileTree files={pdfs} selectedFile={pdfPath} onFileSelect={file=>void selectFile(file)} onAction={(path,mode)=>setFileAction({path,mode})} onMove={(path,folder)=>void moveDraggedFile(path,folder)}/></details>}
          {showAllFiles&&<FileTree files={otherFiles} onFileSelect={file=>void selectFile(file)} onAction={(path,mode)=>setFileAction({path,mode})} onMove={(path,folder)=>void moveDraggedFile(path,folder)}/>}
        </>:<button onClick={()=>void pickFolder()}>Open workspace</button>}
      </aside>}
      <div className="studio-panels fixed-tool-panels">
        {tools.map((tool,index)=><Fragment key={tool}>
          {index>0&&<ToolDivider left={toolWidths[tools[index-1]]} right={toolWidths[tool]} onChange={(left,right)=>setToolWidths(previous=>({...previous,[tools[index-1]]:left,[tool]:right}))}/>}
          <section className="tool-window" aria-label={`${toolNames[tool]} tool`} style={{flexGrow:toolWidths[tool]}}>
            {tool!=='agent'&&<header className="tool-header"><strong>{toolNames[tool]}</strong>{tool==='latex'&&<nav aria-label="LaTeX view">{(['read','write'] as const).map(mode=><button key={mode} aria-pressed={latexMode===mode} onClick={()=>setLatexMode(mode)}>{mode==='read'?'Read':'Write'}</button>)}</nav>}<button className="close-tool" aria-label={`Close ${toolNames[tool]} tool`} onClick={()=>setTools(previous=>previous.filter(t=>t!==tool))}>×</button></header>}
            {tool==='agent'?(project?<AgentPanel key={project.name} project={project.name} current={selectedFile} onClose={()=>setTools(previous=>previous.filter(t=>t!=='agent'))} onOpen={path=>void selectFile(path)} beforeApply={async()=>{if(dirty&&project){await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}}} onApplied={agentApplied}/>:<div className="empty-state"><h2>Agent</h2><button onClick={()=>void pickFolder()}>Open workspace</button><button onClick={()=>setTools(previous=>previous.filter(t=>t!=='agent'))}>Close</button></div>):renderPanel(tool==='graph'?'graph':latexMode,true)}
          </section>
        </Fragment>)}
        {!tools.length&&<div className="empty-tools"><span>✳</span><h2>Your workspace, your tools</h2><button onClick={()=>setToolPicker(true)}>Add tool</button></div>}
      </div>
    </main>
    {toolPicker&&<ToolPicker tools={tools} onAdd={openTool} onClose={()=>setToolPicker(false)}/>}

    {fileAction&&<FileActionsDialog path={fileAction.path} files={files} mode={fileAction.mode} onSave={actOnFile} onClose={()=>setFileAction(null)}/>}
    {trashOpen&&project&&<Trash project={project.name} onRestore={refresh} onClose={()=>setTrashOpen(false)}/>}
    {settingsOpen&&<Settings onClose={()=>setSettingsOpen(false)} onResetLayout={()=>{setLayout({sidebar:true,editor:true,preview:false,sidebarWidth:250,previewWidth:430});setTools(['latex','graph']);setToolWidths({latex:1,agent:1,graph:1});setLatexMode('write');}}>
      <h3>Workspace</h3><label className="settings-row"><span>Current workspace</span><select aria-label="Open project" value={project?.name||''} disabled={busy||loadingFile} onChange={e=>{const next=projects.find(p=>p.name===e.target.value);if(next)void selectProject(next);}}><option value="" disabled>Select a workspace</option>{projects.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
      <div className="settings-actions"><button onClick={()=>{setSettingsOpen(false);void pickFolder();}}>Open folder…</button><button disabled={!project} onClick={()=>void refresh()}>Refresh files</button><button disabled={!project} onClick={()=>{setSettingsOpen(false);setTrashOpen(true);}}>Trash</button><button disabled={!project} onClick={()=>{setSettingsOpen(false);setNodeEditor({kind:'dashboard',node:null});}}>New dashboard</button><button disabled={!project} onClick={()=>{setSettingsOpen(false);setNodeEditor({kind:'data',node:null});}}>Connect data</button></div>
      <label className="settings-row"><span>Show file sidebar</span><input type="checkbox" checked={layout.sidebar} onChange={e=>setLayout(current=>({...current,sidebar:e.target.checked}))}/></label>
      <label className="settings-row"><span>Show supporting files</span><input type="checkbox" checked={showAllFiles} onChange={e=>setShowAllFiles(e.target.checked)}/></label>
      <h3>Account</h3><div className="settings-actions"><button onClick={()=>{setSettingsOpen(false);window.dispatchEvent(new Event('starview-account'));}}>Account settings</button><button onClick={()=>{void save().then(()=>window.dispatchEvent(new Event('starview-sign-out')));}}>Sign out</button></div>
    </Settings>}
    {newDocument&&project&&<NewDocument files={files} folder={selectedFile.includes('/')?selectedFile.slice(0,selectedFile.lastIndexOf('/')):''} busy={busy} onSave={createDocument} onClose={()=>{if(!busy)setNewDocument(false);}}/>}
    {nodeEditor&&project&&<NodeManager key={nodeEditor.node?.id||nodeEditor.kind} node={nodeEditor.node} kind={nodeEditor.kind} graph={graph} onSave={saveNode} onClose={()=>setNodeEditor(null)}/>}
    {showBrowser && <div className="modal-backdrop"><section className="folder-browser" role="dialog" aria-modal="true" aria-labelledby="folder-title">
      <h2 id="folder-title">Open a local folder</h2><p>Browse folders on the computer running StarView’s backend.</p>
      <form onSubmit={e => { e.preventDefault(); void browse(directoryPath); }}><label htmlFor="folder-path">Folder path</label>
        <div className="path-controls"><input autoFocus id="folder-path" value={directoryPath} onChange={e => setDirectoryPath(e.target.value)} placeholder="/Users/your-name/Documents" disabled={busy} /><button disabled={busy || browsing}>Go</button></div></form>
      {browserError && <p className="error" role="alert">{browserError}</p>}
      <div className="browser-navigation"><button disabled={busy || browsing || !listing?.parent} onClick={() => void browse(listing?.parent || undefined)}>Up one folder</button><button disabled={busy || browsing} onClick={() => void browse()}>Home</button></div>
      <p className="project-root">{listing?.path}</p>
      {browsing ? <p role="status">Loading folders…</p> : <ul className="directory-list">{listing?.directories.map(dir => <li key={dir.path}><button disabled={busy} onClick={() => void browse(dir.path)}>{dir.name}/</button></li>)}{listing?.directories.length === 0 && <li>No subfolders. You can open this folder.</li>}</ul>}
      <div className="browser-actions"><button disabled={busy} onClick={() => setShowBrowser(false)}>Cancel</button><button disabled={busy || browsing || !!browserError || !listing || directoryPath !== listing.path} onClick={() => void openFolder()}>{busy ? "Opening…" : "Open this folder"}</button></div>
    </section></div>}
  </div>;
}
export default App;
