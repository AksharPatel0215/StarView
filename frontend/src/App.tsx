import { lazy, Suspense, useEffect, useRef, useState } from "react";
const Editor = lazy(() => import("./components/LocalEditor"));
import { labelConnection, setGraphColor, chooseFolder, getTags, updateTags, browseDirectories, compileProjectFile, getPdfUrl, getConnections, connectDocuments, getAssetUrl, getProjectFile, getProjectFiles, getProjects, openProject, saveProjectFile } from "./api/client";
import type { FileLabels, DirectoryListing, Project, KnowledgeGraph } from "./api/client";
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
import ResizeHandle from "./components/ResizeHandle";
import { getWorkspaceNodes, createWorkspaceNode, updateWorkspaceNode } from "./api/client";
import type { CSSProperties } from "react";
import type { WorkspaceNode } from "./api/client";
import { wikiLinks } from "./documentLinks";
const PdfPreview = lazy(() => import("./components/PdfPreview"));

const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";

function App() {
  const {preferences}=usePreferences();
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [accountNotice,setAccountNotice]=useState(()=>{const result=new URLSearchParams(window.location.search).get('account');return result==='connected'?'Account connected. Add a data node to choose a resource.':result==='failed'?'Account connection was not completed. Try again, or check the provider setup.':'';});
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('account')){const url=new URL(window.location.href);url.searchParams.delete('account');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}},[]);
  const [nodes,setNodes] = useState<WorkspaceNode[]>([]);
  const [activeNode,setActiveNode] = useState<WorkspaceNode|null>(null);
  const [center,setCenter] = useState<'editor'|'dashboard'|'data'>('dashboard');
  const [nodeEditor,setNodeEditor] = useState<{kind:'dashboard'|'data';node:WorkspaceNode|null}|null>(null);
  const [statsVersion,setStatsVersion] = useState(0);
  const [tabs,setTabs] = useState<string[]>([]);
  const [layout,setLayout] = useState(() => {
    const defaults={sidebar:true,editor:true,preview:false,sidebarWidth:250,previewWidth:430};
    try {const saved=JSON.parse(localStorage.getItem('starview-layout')||'null');return saved?{sidebar:!!saved.sidebar,editor:saved.editor!==false,preview:!!saved.preview,sidebarWidth:Math.max(180,Math.min(420,Number(saved.sidebarWidth)||250)),previewWidth:Math.max(280,Math.min(800,Number(saved.previewWidth)||430))}:defaults;}catch{return defaults;}
  });
  useEffect(()=>{localStorage.setItem('starview-layout',JSON.stringify(layout));},[layout]);
  function togglePanel(key:'sidebar'|'editor'|'preview'){setLayout(current=>{const next={...current,[key]:!current[key]};if(!next.editor&&!next.preview)next[key==='editor'?'preview':'editor']=true;return next;});}
  async function reloadNodes(){if(project)setNodes(await getWorkspaceNodes(project.name));}
  function openNode(path:string){const node=nodes.find(item=>item.id===path);if(node){setActiveNode(node);setCenter(node.kind==='dashboard'?'dashboard':'data');setLayout(current=>({...current,editor:true}));}else{void selectFile(path);}}
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
  const [panel, setPanel] = useState<"connections" | "preview">("connections");
  const [readingMode, setReadingMode] = useState(false);
  const [assetPath, setAssetPath] = useState("");
  const [buildDocument, setBuildDocument] = useState("");
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
  const decorations = useRef<import("monaco-editor").editor.IEditorDecorationsCollection | null>(null);
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
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

  function loadGraph(next: KnowledgeGraph, reset = false) {
    setGraph(next);
    setBuildDocument(current => !reset && (!current || next.documents.some(node => node.path === current && node.is_main)) ? current : next.documents.find(node => node.path === "main.tex" && node.is_main)?.path || next.documents.find(node => node.is_main)?.path || "");
  }

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

  async function createDocument(path:string, content:string) {
    if(!project || busy || loadingFile || !canLeave())return;
    setBusy(true);setError("");
    try {
      const created=await createProjectFile(project.name,path,content);
      const id=++fileRequest.current;
      setSelectedFile(created.path);setFileContent(content);setSavedContent(content);setAssetPath("");setPdfPath("");
      setActiveNode(null);setCenter('editor');setReadingMode(false);setBuildDocument('');setLayout(current=>({...current,editor:true}));
      setTabs(current=>Array.from(new Set([...current,created.path])));setNewDocument(false);setFileSearch('');setTagFilter('');setStatus('Document created. Start writing, then compile.');
      const [nextFiles,nextGraph,nextTags]=await Promise.all([getProjectFiles(project.name),getConnections(project.name),getTags(project.name)]);
      if(id===fileRequest.current){setFiles(nextFiles);loadGraph(nextGraph);setTags(nextTags);setStatsVersion(current=>current+1);}
    } catch(e) {setError(message(e));throw e;} finally {setBusy(false);}
  }

  async function selectFile(file: string) {
    const path=file;
    if(path.startsWith('@node/')){openNode(path);return;}
    if(!project||busy||loadingFile||!canLeave())return;
    setActiveNode(null);setCenter('editor');setLayout(current=>({...current,editor:true}));setTabs(current=>current.includes(path)?current:[...current,path]);
    if (!project || busy) return;
    const id = ++fileRequest.current;
    setLoadingFile(true); setError(""); setStatus("");
    try {
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(file)) {
        setAssetPath(file); setSelectedFile(""); setFileContent(""); setSavedContent(""); setPanel("preview");setLayout(current=>({...current,preview:true}));
      } else if (file.toLowerCase().endsWith(".pdf")) {
        if (id !== fileRequest.current) return;
        setSelectedFile(""); setFileContent(""); setSavedContent("");
        setPdfPath(file); setPdfVersion(Date.now()); setAssetPath(""); setPanel("preview");setLayout(current=>({...current,preview:true}));
      } else {
        const content = await getProjectFile(project.name, file);
        if (id !== fileRequest.current) return;
        if (graph.documents.find(node => node.path === file)?.is_main) setBuildDocument(file);
        setSelectedFile(file); setFileContent(content); setSavedContent(content); setAssetPath("");
      }
    } catch (e) { if (id === fileRequest.current) setError(message(e)); }
    finally { if (id === fileRequest.current) setLoadingFile(false); }
  }

  async function followDocument(path: string, render = false) {
    if (!project || busy || loadingFile) return;
    if (!graph.documents.some(node => node.path === path)) { setError("Linked document not found. Refresh files or check the link."); return; }
    if (!canLeave()) return;
    setBusy(true); setError(""); ++fileRequest.current;
    setActiveNode(null);setCenter('editor');setLayout(current=>({...current,editor:true}));setTabs(current=>current.includes(path)?current:[...current,path]);
    try {
      const content = await getProjectFile(project.name, path);
      if (graph.documents.find(node => node.path === path)?.is_main) setBuildDocument(path);
      setSelectedFile(path); setFileContent(content); setSavedContent(content); setAssetPath("");
      if (render && graph.documents.find(node => node.path === path)?.is_main) {
        setStatus("Opening linked document…"); setBuildDocument(path); setRendering(true);
        setPdfPath(await compileProjectFile(project.name, path)); setPdfVersion(Date.now()); setPanel("preview"); setLayout(current=>({...current,preview:true}));
      } else if (render) setPanel("connections");
      setStatus("Linked document opened");
    } catch (e) { setError(message(e)); setStatus("Could not open linked document"); }
    finally { setBusy(false); setRendering(false); }
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

  const liveLinks = wikiLinks(fileContent).map(link => ({ target: resolveKeyword(link.target), label: link.label }));
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model || !decorations.current) return;
    decorations.current.set(wikiLinks(fileContent).map(link => {
      const start = model.getPositionAt(link.start), end = model.getPositionAt(link.end);
      return { range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }, options: { inlineClassName: "wiki-link-token", hoverMessage: { value: "Cmd/Ctrl-click or Cmd/Ctrl-Enter to open this document." } } };
    }));
  }, [fileContent, selectedFile]);

  async function save(compile = false) {
    if (!project || !selectedFile || busy || loadingFile) return;
    setBusy(true); setError(""); setStatus(compile ? "Compiling…" : "Saving…");
    try {
      await saveProjectFile(project.name, selectedFile, fileContent);
      setSavedContent(fileContent);
      if (compile) {
        setRendering(true); setPanel("preview");
        setPdfPath(await compileProjectFile(project.name, buildDocument || selectedFile));
        setPanel("preview"); setAssetPath("");
        setPdfVersion(Date.now());setLayout(current=>({...current,preview:true}));
        setFiles(await getProjectFiles(project.name));
      }
      loadGraph(await getConnections(project.name));
      setStatsVersion(current=>current+1); setStatus(compile ? "Build complete" : "All changes saved");
    } catch (e) { setError(message(e)); setStatus("Action failed"); }
    finally { setBusy(false); setRendering(false); }
  }

  const activePath = selectedFile || assetPath || pdfPath;
  const activeTags = tags[activePath];
  const allTags = [...new Set(Object.values(tags).flatMap(value => [value.folder, ...value.custom]))].sort();
  const visibleFiles = files.filter(file => (!tagFilter || (tags[file] && [tags[file].folder, ...tags[file].custom].includes(tagFilter))) && `${file} ${tags[file]?.custom.join(" ") || ""}`.toLowerCase().includes(fileSearch.trim().toLowerCase()));
  const filteredGraph = tagFilter ? { ...graph, documents: graph.documents.filter(node => node.tags.includes(tagFilter)), links: graph.links.filter(link => graph.documents.find(node => node.path === link.source)?.tags.includes(tagFilter) && graph.documents.find(node => node.path === link.target)?.tags.includes(tagFilter)) } : graph;
  const documents = visibleFiles.filter(file => /\.tex$/i.test(file));
  const resources = visibleFiles.filter(file => /\.(bib|bst|sty|cls|png|jpe?g|gif|webp|svg|eps)$/i.test(file));
  const pdfs = visibleFiles.filter(file => /\.pdf$/i.test(file) && !documents.some(source => source.slice(0, -4) === file.slice(0, -4) || source.split("/").pop()?.slice(0, -4) === file.slice(0, -4)));
  const otherFiles = visibleFiles.filter(file => !documents.includes(file) && !resources.includes(file) && !pdfs.includes(file));

  return <div className="app">
    <header className="header"><h1><span className="brand-mark" aria-hidden="true">✳</span>StarView</h1>
      <span className="header-spacer" />
      {projects.length > 0 && <select aria-label="Open project" value={project?.name || ""} disabled={busy || loadingFile} onChange={e => {
        const next = projects.find(item => item.name === e.target.value); if (next) void selectProject(next);
      }}><option value="" disabled>Select a project</option>{projects.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}
      <button className="primary" disabled={!project||busy||loadingFile} title="Create a document (Alt+N)" onClick={()=>setNewDocument(true)}>+ New document</button>
      <button disabled={!project} aria-pressed={layout.preview&&panel==='connections'} onClick={()=>{setPanel('connections');setLayout(current=>({...current,preview:!(current.preview&&panel==='connections')}));}}>Graph</button>
      <button onClick={()=>setSettingsOpen(true)}>Settings</button><CompactMenu label="View">{(['sidebar','editor','preview'] as const).map(key=><button key={key} aria-pressed={layout[key]} onClick={()=>togglePanel(key)}>{layout[key]?'✓ ':''}{key==='sidebar'?'Files':key==='editor'?'Editor':'Preview & connections'}</button>)}<button onClick={()=>setLayout({sidebar:true,editor:true,preview:false,sidebarWidth:250,previewWidth:430})}>Reset layout</button></CompactMenu>
      <CompactMenu label="Workspace"><button disabled={busy||loadingFile} onClick={()=>void pickFolder()}>Open folder…</button><button disabled={!project} onClick={()=>{setActiveNode(null);setCenter('dashboard');setLayout(current=>({...current,editor:true}));}}>Overview</button><button disabled={!project} onClick={()=>setNodeEditor({kind:'dashboard',node:null})}>New dashboard</button><button disabled={!project} onClick={()=>setNodeEditor({kind:'data',node:null})}>Connect a data node</button></CompactMenu>
    </header>
    {accountNotice&&<p className="account-notice" role="status">{accountNotice}<button aria-label="Dismiss account notice" onClick={()=>setAccountNotice('')}>×</button></p>}
    {error && <p className="error" role="alert">{error}</p>}

    <main style={{'--sidebar-width':layout.sidebar?`${layout.sidebarWidth}px`:'0px'} as CSSProperties} className={`workspace adaptable${!layout.sidebar?' sidebar-hidden':''}${!layout.editor?' editor-hidden':''}${!layout.preview?' preview-hidden':''}${readingMode && panel === "preview" && pdfPath && !assetPath ? " reading-mode" : ""}`}>
      <aside className="sidebar" style={{width:layout.sidebarWidth}}><h2>{project?.name || "Your workspace"}</h2>
        {project && <><p className="workspace-location" title={project.root}>Local folder</p>
          <div className="sidebar-search"><input className="file-search" type="search" aria-label="Search files" placeholder="Find a document…" value={fileSearch} onChange={e => setFileSearch(e.target.value)} /><CompactMenu label={tagFilter?'Filter •':'Filter'}><label className="tag-filter">Tag<select aria-label="Filter by tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}><option value="">All files</option>{allTags.map(tag => <option key={tag}>{tag}</option>)}</select></label><button disabled={busy||loadingFile} onClick={()=>void refresh()}>Refresh files</button><button aria-pressed={showAllFiles} onClick={()=>setShowAllFiles(!showAllFiles)}>{showAllFiles?'Hide other files':'Show other files'}</button><button onClick={()=>{setShowBrowser(true);void browse(project.root);}}>Browse folders…</button></CompactMenu></div>
          {tagFilter&&<button className="active-filter" onClick={()=>setTagFilter('')}>{tagFilter} ×</button>}
          {nodes.length>0&&<><p className="section-label">Workspace nodes · {nodes.length}</p><div className="workspace-node-list">{nodes.map(node=><button key={node.id} className={activeNode?.id===node.id?'active':''} onClick={()=>openNode(node.id)}><span>{node.kind==='dashboard'?'◈':'▤'}</span><span>{node.title}<small>{node.kind==='dashboard'?'Dashboard hub':node.resource?.provider==='google'?'Google Drive':'OneDrive'}</small></span></button>)}</div></>}
          <div className="documents-heading"><p className="section-label">Documents <span>{documents.length}</span></p><button aria-label="Create new document" title="New document (Alt+N)" disabled={busy||loadingFile} onClick={()=>setNewDocument(true)}>+</button></div>
          <FileTree files={documents} selectedFile={selectedFile} onFileSelect={file => void selectFile(file)} />
          {documents.length === 0 && <div className="empty-documents"><p>Your next idea starts here.</p><button disabled={busy||loadingFile} onClick={()=>setNewDocument(true)}>Create your first document</button></div>}
          {resources.length > 0 && <details className="sidebar-group"><summary>References & assets <small>{resources.length}</small></summary><FileTree files={resources} selectedFile={assetPath || selectedFile} onFileSelect={file => void selectFile(file)} /></details>}
          {pdfs.length > 0 && <details className="sidebar-group"><summary>Imported PDFs <small>{pdfs.length}</small></summary><FileTree files={pdfs} selectedFile={pdfPath} onFileSelect={file => void selectFile(file)} /></details>}
          {showAllFiles && <><p className="section-label">Other files</p><FileTree files={otherFiles} selectedFile={selectedFile} onFileSelect={file => void selectFile(file)} /></>}
        </>}
        {!project && <div className="empty-state"><p>Open a folder to bring your documents together.</p></div>}
      </aside>
      {layout.sidebar&&(layout.editor||layout.preview)&&<ResizeHandle label="Resize file sidebar" value={layout.sidebarWidth} min={180} max={420} onChange={sidebarWidth=>setLayout(current=>({...current,sidebarWidth}))}/>}
      <section className="editor" style={{display:layout.editor?undefined:'none'}}>
        {project&&center!=='editor'?<><div className="node-workspace-actions">{selectedFile&&<button onClick={()=>{setCenter('editor');setActiveNode(null);}}>Back to {selectedFile.split('/').pop()}</button>}{activeNode&&<button onClick={()=>setNodeEditor({kind:activeNode.kind,node:activeNode})}>Edit node & connections</button>}</div>{center==='data'&&activeNode?<DataViewer project={project.name} node={activeNode} connections={graph.documents.filter(item=>activeNode.targets.includes(item.path))} onOpen={openNode}/>:<Dashboard project={project.name} node={activeNode} refresh={statsVersion} resources={graph.documents.filter(item=>item.kind==='data'&&(!activeNode||activeNode.targets.includes(item.path)))} onOpen={path=>void selectFile(path)}/>}</>:<>
        {tabs.length>0&&<div className="document-tabs" role="tablist" aria-label="Open files">{tabs.map(path=><div key={path}><button role="tab" aria-selected={selectedFile===path||assetPath===path||pdfPath===path} onClick={()=>void selectFile(path)} title={path}>{path.split('/').pop()}</button><button aria-label={`Close tab ${path}`} disabled={busy||loadingFile} onClick={()=>{if(path===selectedFile||path===assetPath||path===pdfPath){if(!canLeave())return;setSelectedFile('');setAssetPath('');setPdfPath('');setFileContent('');setSavedContent('');}setTabs(current=>current.filter(item=>item!==path));}}>×</button></div>)}</div>}
        <div className="editor-header"><h2 title={selectedFile||assetPath}>{(selectedFile || assetPath).split('/').pop() || "Document workspace"}{dirty ? " •" : ""}</h2>
          {selectedFile && <div className="editor-actions"><button disabled={busy || loadingFile} onClick={() => void save()}>Save</button>
            {selectedFile.toLowerCase().endsWith(".tex") && <button className="primary" disabled={busy || loadingFile} onClick={() => void save(true)}>{busy ? "Working…" : "Compile ↗"}</button>}
          </div>}
        </div>
        {activeTags && <details className="document-details"><summary>Tags <span>{activeTags.folder}{activeTags.custom.length?` · ${activeTags.custom.length} labels`: ""}</span></summary><div className="file-tags"><span className="tag-chip folder-tag" title="Automatic containing-folder tag">{activeTags.folder}</span>{activeTags.custom.map(tag => <button className="tag-chip" key={tag} disabled={busy} aria-label={`Remove tag ${tag}`} onClick={() => void editTags(activeTags.custom.filter(value => value !== tag))}>{tag} ×</button>)}<form onSubmit={e => { e.preventDefault(); if (tagDraft.trim()) void editTags([...activeTags.custom, tagDraft.trim()]); }}><input aria-label="New tag" placeholder="Add tag…" value={tagDraft} maxLength={60} disabled={busy} onChange={e => setTagDraft(e.target.value)} list="workspace-tags"/><button disabled={busy || !tagDraft.trim()}>+</button></form><datalist id="workspace-tags">{allTags.map(tag => <option key={tag} value={tag}/>)}</datalist></div></details>}
        {selectedFile ? <div className="editor-body"><Suspense fallback={<p className="reader-loading">Opening editor…</p>}><Editor documents={graph.documents} documentPath={selectedFile} height="100%" path={`${project?.name}/${selectedFile}`} language={selectedFile.toLowerCase().endsWith(".tex") ? "latex" : "plaintext"} theme="starview" onMount={(editor, monaco) => {
            editorRef.current = editor;
            decorations.current = editor.createDecorationsCollection(wikiLinks(editor.getValue()).map(link => {
              const model = editor.getModel()!; const start = model.getPositionAt(link.start), end = model.getPositionAt(link.end);
              return { range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }, options: { inlineClassName: "wiki-link-token", hoverMessage: { value: "Cmd/Ctrl-click or Cmd/Ctrl-Enter to open this document." } } };
            }));
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
          }} beforeMount={monaco => monaco.editor.defineTheme("starview", { base: "vs-dark", inherit: true, rules: [], colors: { "editor.background": "#191d26", "editorLineNumber.foreground": "#515c70", "editor.lineHighlightBackground": "#202631", "editor.selectionBackground": "#41365c" } })} value={fileContent} options={{ readOnly: busy || loadingFile, fontSize: preferences.fontSize, lineHeight: Math.round(preferences.fontSize*1.75), minimap: { enabled: false }, padding: { top: 14 }, scrollBeyondLastLine: false, wordWrap: preferences.wordWrap?"on":"off" }} onChange={value => setFileContent(value ?? "")} /></Suspense></div>
          : <div className="empty-state"><div className="empty-icon" aria-hidden="true">✧</div><h2>{assetPath ? "Image preview" : "Make room for your ideas"}</h2><p>{assetPath ? "Your image is open in the preview panel." : "Choose a document to write, or explore how your LaTeX documents connect."}</p>{!project ? <button className="primary" onClick={() => void pickFolder()}>Open a local folder</button> : <button className="primary" onClick={()=>setNewDocument(true)}>Create a document</button>}</div>}
        {selectedFile.toLowerCase().endsWith(".tex") && liveLinks.length>0 && <details className="document-details link-details"><summary>Links <span>{liveLinks.length}</span></summary><div className="inline-links">{liveLinks.length ? liveLinks.map((link, index) => <button key={index} disabled={busy || loadingFile || !link.target} title={link.target || "Document not found or ambiguous"} onClick={() => { if (link.target) void followDocument(link.target); }}>{link.label}{!link.target && " (unresolved)"}</button>) : <small>Type [[ to find a document · Enter to link · ⌘/Ctrl-click to follow</small>}</div></details>}
        <footer className="editor-status"><span role="status">{loadingFile ? "Opening file…" : status || (dirty ? "Unsaved changes" : "Ready")}</span>
          {project && <details className="compile-options"><summary>Compile settings</summary><label>Main document <select aria-label="Main document" value={buildDocument} disabled={busy} onChange={e => setBuildDocument(e.target.value)}><option value="">Compile selected file</option>{graph.documents.filter(node => node.is_main).map(node => <option key={node.path} value={node.path}>{node.path}</option>)}</select></label></details>}
        </footer>
      </>}
      </section>
      {layout.editor&&layout.preview&&<ResizeHandle label="Resize inspector" value={layout.previewWidth} min={280} max={800} reverse onChange={previewWidth=>setLayout(current=>({...current,previewWidth}))}/>}
      <section className="preview" style={{width:layout.editor?layout.previewWidth:undefined,display:layout.preview?undefined:'none'}}>{rendering && <div className="render-overlay" role="status"><span className="loading-orbit"/>Rendering your document…</div>}<div className="panel-header"><button className={panel === "connections" ? "active" : ""} aria-pressed={panel === "connections"} onClick={() => setPanel("connections")}>Connections</button><button className={panel === "preview" ? "active" : ""} aria-pressed={panel === "preview"} onClick={() => setPanel("preview")}>Preview</button>{panel === "preview" && pdfPath && !assetPath && <button className="reading-toggle" aria-pressed={readingMode} onClick={() => setReadingMode(!readingMode)}>{readingMode ? "Show editor" : "Focus reading"}</button>}</div>
        {panel === "connections" ? <Connections key={project?.name || "empty"} graph={filteredGraph} selected={activeNode?.id||selectedFile} busy={busy || loadingFile} onOpen={openNode} onConnect={(source, target, remove) => void connect(source, target, remove)} onLabel={labelEdge} onColor={colorGraph} />
          : project && assetPath ? <img className="asset-preview" src={getAssetUrl(project.name, assetPath)} alt={assetPath} onError={() => setError("Could not load this image")} />
          : project && pdfPath ? <Suspense fallback={<p className="reader-loading" role="status">Loading reader…</p>}><PdfPreview url={getPdfUrl(project.name, pdfPath, pdfVersion)} onOpen={path => void followDocument(path, true)} /></Suspense>
          : <div className="empty-state"><div className="empty-icon" aria-hidden="true">▤</div><h2>Your document, rendered</h2><p>Compile your main document to see its PDF here. Images and imported PDFs open here too.</p></div>}
      </section>
    </main>
    {settingsOpen&&<Settings onClose={()=>setSettingsOpen(false)} onResetLayout={()=>setLayout({sidebar:true,editor:true,preview:false,sidebarWidth:250,previewWidth:430})}/>}
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
