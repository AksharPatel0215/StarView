import WorkspaceExplorer from './components/WorkspaceExplorer';
import DraftDocument from './components/DraftDocument';
import {responsePaths,sceneGraph} from './agentScene';
import type {AgentScene} from './agentScene';
import type {AgentReply,AgentProposal} from './api/client';
import { useMemo, lazy, Suspense, useEffect, useRef, useState } from "react";
const Editor = lazy(() => import("./components/LocalEditor"));
import { labelConnection, setGraphColor, chooseFolder, getTags, updateTags, browseDirectories, compileProjectFile, getPdfUrl, getConnections, connectDocuments, getAssetUrl, getProjectFile, getProjectFiles, getProjects, openProject, saveProjectFile } from "./api/client";
import type { FileLabels, DirectoryListing, Project, KnowledgeGraph } from "./api/client";
import FileActionsDialog from "./components/FileActionsDialog";
import Trash from "./components/Trash";
import {moveFile,deleteFile} from "./api/client";
import {DocumentSaveQueue,moveDestination} from './documentFlow';
import FlashcardSet from './components/FlashcardSet';
import {closePagePlan} from './workspaceNavigation';
import NavIcon from './components/NavIcon';
import AgentPanel from './components/AgentPanel';
import DockWorkspace from './components/DockWorkspace';
import ResizeHandle from './components/ResizeHandle';
import ToolPicker from './components/ToolPicker';
import {restoreTools,addTool} from './panelLayout';
import './docking.css';
import './fixed-panels.css';
import type {PanelMode,Tool} from './panelLayout';
import Settings from "./components/Settings";
import {usePreferences} from "./preferences";
import CompactMenu from "./components/CompactMenu";
import NewDocument from "./components/NewDocument";
import { createProjectFile } from "./api/client";
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
  const [center,setCenter] = useState<'editor'|'dashboard'|'data'|'flashcards'>('dashboard');
  const [nodeEditor,setNodeEditor] = useState<{kind:'dashboard'|'data'|'flashcards';node:WorkspaceNode|null}|null>(null);
  const [statsVersion,setStatsVersion] = useState(0);
  const [tabs,setTabs] = useState<string[]>([]);
  const [layout,setLayout] = useState(() => {
    const defaults={sidebar:true,editor:true,preview:false,sidebarWidth:250,previewWidth:430};
    try {const saved=JSON.parse(localStorage.getItem('starview-layout')||'null');return saved?{sidebar:!!saved.sidebar,editor:saved.editor!==false,preview:!!saved.preview,sidebarWidth:Math.max(180,Math.min(420,Number(saved.sidebarWidth)||250)),previewWidth:Math.max(280,Math.min(800,Number(saved.previewWidth)||430))}:defaults;}catch{return defaults;}
  });
  useEffect(()=>{localStorage.setItem('starview-layout',JSON.stringify(layout));},[layout]);

  async function reloadNodes(){if(project)setNodes(await getWorkspaceNodes(project.name));}
  async function openNode(path:string){if(busy||loadingFile)return;openTool('latex');const node=nodes.find(item=>item.id===path);if(node){if(dirty&&project){try{await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}catch(e){setError(message(e));return;}}setTabs(previous=>previous.includes(path)?previous:[...previous,path]);setActiveNode(node);setCenter(node.kind==='dashboard'?'dashboard':node.kind==='flashcards'?'flashcards':'data');setLayout(current=>({...current,editor:true}));}else{if(path.startsWith('@node/')){setError('This workspace page is no longer available.');return;}return selectFile(path);}}
  async function saveNode(value:{title:string;kind:'dashboard'|'data'|'flashcards';targets:string[];resource?:{provider:string;id:string}}){if(!project)return;if(dirty){await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}openTool('latex');const next=nodeEditor?.node?await updateWorkspaceNode(project.name,{...nodeEditor.node,title:value.title,targets:value.targets}):await createWorkspaceNode(project.name,value);await reloadNodes();loadGraph(await getConnections(project.name));setTabs(previous=>previous.includes(next.id)?previous:[...previous,next.id]);setActiveNode(next);setCenter(next.kind==='dashboard'?'dashboard':next.kind==='flashcards'?'flashcards':'data');setStatsVersion(current=>current+1);}
  const [tags, setTags] = useState<FileLabels>({});
  const [fileSearch, setFileSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [rendering, setRendering] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  useEffect(()=>{let active=true;setNodes([]);setActiveNode(null);setCenter('dashboard');setTabs([]);if(project)getWorkspaceNodes(project.name).then(value=>{if(active)setNodes(value);}).catch(e=>setError(message(e)));return()=>{active=false;};},[project]);
  const [notesQueryHasResult,setNotesQueryHasResult]=useState(true);
  const [retrievingNotes,setRetrievingNotes]=useState(false);
  const [agentScene,setAgentScene]=useState<AgentScene|null>(null);
  const [sceneVersion,setSceneVersion]=useState(0);
  useEffect(()=>{setAgentScene(null);},[project]);
  const [graph, setGraph] = useState<KnowledgeGraph>({ documents: [], links: [] });
  const [newDocument,setNewDocument] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [tools,setTools]=useState<Tool[]>(()=>localStorage.getItem('starview-fixed-layout')==='1'?restoreTools(localStorage.getItem('starview-tools')):['latex','graph','agent']);
  const [latexMode,setLatexMode]=useState<'read'|'write'>(()=>localStorage.getItem('starview-latex-mode')==='read'?'read':'write');
  const [focusedTool,setFocusedTool]=useState<Tool|null>(null);
  const [toolPicker,setToolPicker]=useState(false);
  const [dockReset,setDockReset]=useState(0);
  const reading=tools.includes('latex')&&latexMode==='read';
  const view=reading?'page':'write';
  function openTool(tool:Tool){setTools(previous=>addTool(previous,tool));setToolPicker(false);setFocusedTool(null);}
  function setView(mode:'write'|'page'){openTool('latex');setLatexMode(mode==='page'?'read':'write');}
  useEffect(()=>{localStorage.setItem('starview-tools',JSON.stringify(tools));localStorage.setItem('starview-latex-mode',latexMode);},[tools,latexMode]);
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
    setNotesQueryHasResult(true);
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
  const agentGraph=useMemo(()=>agentScene?sceneGraph(graph,agentScene):null,[graph,agentScene]);
  const draftNote=agentScene?.proposal?.changes.find(change=>change.kind==='create_note'||change.kind==='update_note');
  function previewProposal(proposal:AgentProposal|null){setAgentScene(previous=>proposal?{paths:proposal.citations,proposal}:previous?{paths:previous.paths,proposal:null}:null);setSceneVersion(v=>v+1);if(proposal){openTool('latex');openTool('graph');}}
  function showAgentResponse(prompt:string,reply:AgentReply){setNotesQueryHasResult(true);setRetrievingNotes(false);const paths=responsePaths(prompt,reply,graph);setAgentScene(paths.length||reply.proposal?{paths,proposal:reply.proposal,exactPath:!!reply.concept_path}:null);setSceneVersion(v=>v+1);openTool('graph');if(reply.proposal){openTool('latex');}else if(paths[0]){setTabs(paths);setLatexMode('read');void selectFile(paths[0]);}}
  const filteredGraph = tagFilter ? { ...graph, documents: graph.documents.filter(node => node.tags.includes(tagFilter)), links: graph.links.filter(link => graph.documents.find(node => node.path === link.source)?.tags.includes(tagFilter) && graph.documents.find(node => node.path === link.target)?.tags.includes(tagFilter)) } : graph;
  const documents = visibleFiles.filter(file => /\.tex$/i.test(file));
  const resources = visibleFiles.filter(file => /\.(bib|bst|sty|cls|png|jpe?g|gif|webp|svg|eps)$/i.test(file));
  const pdfs = visibleFiles.filter(file => /\.pdf$/i.test(file) && !documents.some(source => source.slice(0, -4) === file.slice(0, -4) || source.split("/").pop()?.slice(0, -4) === file.slice(0, -4)));
  const otherFiles = visibleFiles.filter(file => !documents.includes(file) && !resources.includes(file) && !pdfs.includes(file));

  const currentPage=center==='editor'?actionPath:activeNode?.id||'@home';
  const pageTitle=(path:string)=>graph.documents.find(doc=>doc.path===path)?.title||nodes.find(node=>node.id===path)?.title||path.split('/').pop()?.replace(/\.tex$/,'')||'Page';
  async function goHome(){setNotesQueryHasResult(true);if(busy||loadingFile)return;try{if(dirty&&project){await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}openTool('latex');setActiveNode(null);setCenter('dashboard');}catch(e){setError(message(e));}}
  function closeTool(tool:Tool){setTools(previous=>previous.filter(t=>t!==tool));if(focusedTool===tool)setFocusedTool(null);}
  async function closePage(path:string){try{if(path===currentPage&&dirty&&project){await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}const plan=closePagePlan(tabs,currentPage,path);if(plan.next==='@home')await goHome();else if(plan.next)await openNode(plan.next);setTabs(plan.tabs);}catch(e){setError(message(e));}}
  function renderPanel(mode:PanelMode,visible:boolean) {return <>
    {mode==='graph'&&<div className="pane-graph-holder"><div className="studio-graph">{agentScene&&<div className="agent-scene-bar"><span>{agentScene.proposal?'Proposed graph · dotted items await approval':'Agent sources & connecting paths'}</span><button onClick={()=>setAgentScene(null)}>Clear focus</button></div>}<Connections visible={visible && mode==='graph'} key={(project?.name||'empty')+':graph'} pathNodes={agentScene?.exactPath?agentScene.paths:undefined} focusPaths={agentGraph?.focusPaths} sceneVersion={agentScene?sceneVersion:undefined} graph={agentGraph||filteredGraph} selected={notesQueryHasResult?(draftNote?.path||agentScene?.paths[0]||activeNode?.id||selectedFile):''} busy={busy||loadingFile} onOpen={path=>{const draft=agentScene?.proposal?.changes.find(change=>change.path===path&&(change.kind==='create_note'||change.kind==='update_note'));if(draft){setAgentScene(previous=>previous?{...previous,proposal:{...previous.proposal!,changes:[draft,...previous.proposal!.changes.filter(c=>c!==draft)]}}:previous);openTool('latex');}else{setAgentScene(null);void openNode(path);}}} onConnect={(source,target,remove)=>void connect(source,target,remove)} onLabel={labelEdge} onColor={colorGraph}/></div></div>}
    {mode!=='graph'&&retrievingNotes&&<section className="empty-state" role="status"><p>Finding relevant notes…</p></section>}
    {mode!=='graph'&&!retrievingNotes&&!notesQueryHasResult&&<section className="empty-state"><p>No notes to show for this query. Retry or open a note.</p></section>}
    {mode!=='graph'&&!retrievingNotes&&notesQueryHasResult&&draftNote&&project?<section className="agent-note-preview"><svg className="draft-preview-frame" aria-hidden="true"><rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx="5"/></svg><div className="agent-scene-bar provisional-banner"><span>Draft preview · not applied</span><button onClick={()=>setAgentScene(null)}>Back to notes</button></div><strong>{draftNote.path}</strong><DraftDocument key={agentScene?.proposal?.id+draftNote.path} project={project.name} path={draftNote.path} content={draftNote.content} readOnly initialMode="preview" onChange={()=>{}} onOpen={path=>void selectFile(path)}/></section>:null}
    {mode!=='graph'&&!retrievingNotes&&notesQueryHasResult&&!draftNote&&(<section className="studio-content" aria-label={`${mode==='write'?'Write':'Read'} document`}>
        <div className="page-navigation-row"><nav className="page-tabs" aria-label="Open documents"><button className={`page-tab-home${currentPage==='@home'?' active':''}`} aria-label="Workspace overview" title="Workspace overview" disabled={busy||loadingFile} aria-current={currentPage==='@home'?'page':undefined} onClick={()=>void goHome()}><NavIcon name="home"/></button>{tabs.map(path=><div className={`page-tab${currentPage===path?' active':''}`} key={path}><button aria-current={currentPage===path?'page':undefined} title={path.startsWith('@node/')?pageTitle(path):path} onClick={()=>void openNode(path)}>{pageTitle(path)}{path===selectedFile&&dirty&&<span className="unsaved-dot" aria-label="Unsaved changes"/>}</button><button className="page-tab-close" disabled={busy||loadingFile} aria-label={`Close ${pageTitle(path)} tab`} onClick={()=>void closePage(path)}><NavIcon name="close"/></button></div>)}</nav>
        <div className="page-actions">{activePath&&center==='editor'&&<CompactMenu label="Document actions" iconOnly>
          <p className="project-root">{actionPath}</p><button onClick={()=>setFileAction({path:actionPath,mode:'move'})}>Rename / move</button><button onClick={()=>setFileAction({path:actionPath,mode:'delete'})}>Delete</button>
          {activeTags&&<><p>Labels</p><div className="file-tags">{activeTags.custom.map(tag=><button key={tag} onClick={()=>void editTags(activeTags.custom.filter(item=>item!==tag))}>{tag} ×</button>)}<form onSubmit={event=>{event.preventDefault();if(tagDraft.trim())void editTags([...activeTags.custom,tagDraft.trim()]);}}><input aria-label="New tag" value={tagDraft} onChange={event=>setTagDraft(event.target.value)} placeholder="Add label…"/><button disabled={!tagDraft.trim()}>Add</button></form></div></>}
        </CompactMenu>}{activeNode&&<CompactMenu label="Document actions" iconOnly><button onClick={()=>setNodeEditor({kind:activeNode.kind,node:activeNode})}>Details & connections</button></CompactMenu>}</div></div>
        {project&&center!=='editor'?center==='flashcards'&&activeNode?<FlashcardSet key={activeNode.id} project={project.name} node={activeNode} topics={graph.documents.filter(doc=>activeNode.targets.includes(doc.path)).map(doc=>doc.title)} onSaved={node=>{setActiveNode(node);setNodes(previous=>previous.map(n=>n.id===node.id?node:n));}}/>:center==='data'&&activeNode?<DataViewer project={project.name} node={activeNode} connections={graph.documents.filter(item=>activeNode.targets.includes(item.path))} onOpen={openNode}/>:<Dashboard documents={graph.documents} project={project.name} node={activeNode} refresh={statsVersion} resources={graph.documents.filter(item=>item.kind==='data'&&(!activeNode||activeNode.targets.includes(item.path)))} nodes={nodes} onOpen={path=>void openNode(path)}/>:null}
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
    setAgentScene(null);
    if(paths[0])await selectFile(paths[0]);
  }

  return <div className="app studio-app">
    <header className="studio-header">
      <button className="nav-icon-button" aria-label={layout.sidebar?'Hide sidebar':'Show sidebar'} title={layout.sidebar?'Hide sidebar':'Show sidebar'} aria-pressed={layout.sidebar} onClick={()=>setLayout(current=>({...current,sidebar:!current.sidebar}))}><NavIcon name="sidebar"/></button>
      <button className="studio-brand" disabled={busy||loadingFile} title="Workspace overview" onClick={()=>void goHome()}><span>{project?.name||'StarView'}</span></button>
      <button className="nav-icon-button" aria-label="Settings" title="Settings" onClick={()=>setSettingsOpen(true)}><NavIcon name="settings"/></button>
    </header>
    {accountNotice&&<p className="account-notice" role="status">{accountNotice}<button aria-label="Dismiss account notice" onClick={()=>setAccountNotice('')}>×</button></p>}
    {error&&<p className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></p>}
    <main className="studio-workspace">
      {layout.sidebar&&<aside className="sidebar studio-sidebar" style={{width:layout.sidebarWidth}}>
        <div className="sidebar-heading" onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-starview-file'))event.preventDefault();}} onDrop={event=>{event.preventDefault();const path=event.dataTransfer.getData('application/x-starview-file');if(path)void moveDraggedFile(path,'');}}><span>Workspace</span><CompactMenu label="Create in workspace" iconOnly icon={<NavIcon name="add"/>}><button disabled={!project||busy||loadingFile} onClick={()=>setNewDocument(true)}>New note</button><button disabled={!project} onClick={()=>setNodeEditor({kind:'flashcards',node:null})}>New flashcard set</button><button disabled={!project} onClick={()=>setNodeEditor({kind:'dashboard',node:null})}>New dashboard</button><button disabled={!project} onClick={()=>setNodeEditor({kind:'data',node:null})}>Connect data</button></CompactMenu></div>
        {project?<><input className="file-search" type="search" aria-label="Search files" placeholder="Search workspace…" value={fileSearch} onChange={e=>setFileSearch(e.target.value)}/>
          <WorkspaceExplorer nodes={nodes} files={[...documents,...resources,...pdfs,...(showAllFiles?otherFiles:[])]} documents={graph.documents} selected={activeNode?.id||(center==='editor'?(assetPath||selectedFile):'')} query={fileSearch} onOpen={path=>{setAgentScene(null);void openNode(path);}} onAction={(path,mode)=>setFileAction({path,mode})} onMove={(path,folder)=>void moveDraggedFile(path,folder)} disabled={busy||loadingFile}/>
        </>:<button onClick={()=>void pickFolder()}>Open workspace</button>}
      </aside>}
      {layout.sidebar&&<ResizeHandle label="Sidebar width" value={layout.sidebarWidth} min={180} max={420} onChange={sidebarWidth=>setLayout(current=>({...current,sidebarWidth}))}/>}
      <DockWorkspace tools={tools} focused={focusedTool} onFocus={setFocusedTool} onClose={closeTool} resetVersion={dockReset}
        controls={tool=>tool==='latex'&&center==='editor'?<nav className="page-view-toggle" aria-label="Notes view">{(['read','write'] as const).map(mode=><button key={mode} title={mode==='read'?'Read note':'Write source'} aria-label={mode==='read'?'Read note':'Write source'} aria-pressed={latexMode===mode} onClick={()=>setLatexMode(mode)}><NavIcon name={mode}/></button>)}</nav>:null}
        render={tool=>tool==='agent'?(project?<AgentPanel onQueryEnd={()=>setRetrievingNotes(false)} onQueryStart={()=>{setNotesQueryHasResult(false);setRetrievingNotes(true);setAgentScene(null);setTabs([]);}} onResponse={showAgentResponse} onPreview={previewProposal} embedded key={project.name} project={project.name} current={selectedFile} onClose={()=>closeTool('agent')} onOpen={path=>{setAgentScene({paths:[path],proposal:null});setSceneVersion(v=>v+1);void selectFile(path);}} beforeApply={async()=>{if(dirty&&project){await persistFile(project.name,selectedFile,fileContent);setSavedContent(fileContent);}}} onApplied={agentApplied}/>:<div className="empty-state"><h2>Agent</h2><button onClick={()=>void pickFolder()}>Open workspace</button><button onClick={()=>closeTool('agent')}>Close</button></div>):renderPanel(tool==='graph'?'graph':latexMode,!focusedTool||focusedTool===tool)}
        empty={<div className="empty-tools"><span>✳</span><h2>Your workspace, your tools</h2><button onClick={()=>setToolPicker(true)}>Add tool</button></div>}/>
    </main>
    {toolPicker&&<ToolPicker tools={tools} onAdd={openTool} onClose={()=>setToolPicker(false)}/>}

    {fileAction&&<FileActionsDialog path={fileAction.path} files={files} mode={fileAction.mode} onSave={actOnFile} onClose={()=>setFileAction(null)}/>}
    {trashOpen&&project&&<Trash project={project.name} onRestore={refresh} onClose={()=>setTrashOpen(false)}/>}
    {settingsOpen&&<Settings onClose={()=>setSettingsOpen(false)} onResetLayout={()=>{setLayout({sidebar:true,editor:true,preview:false,sidebarWidth:250,previewWidth:430});setTools(['latex','graph','agent']);setFocusedTool(null);setDockReset(version=>version+1);setLatexMode('write');}}>
      <h3>Workspace</h3><label className="settings-row"><span>Current workspace</span><select aria-label="Open project" value={project?.name||''} disabled={busy||loadingFile} onChange={e=>{const next=projects.find(p=>p.name===e.target.value);if(next)void selectProject(next);}}><option value="" disabled>Select a workspace</option>{projects.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
      <div className="settings-actions"><button onClick={()=>{setSettingsOpen(false);void pickFolder();}}>Open folder…</button><button disabled={!project} onClick={()=>void refresh()}>Refresh files</button><button disabled={!project} onClick={()=>{setSettingsOpen(false);setTrashOpen(true);}}>Trash</button></div>
      <label className="settings-row"><span>Show file sidebar</span><input type="checkbox" checked={layout.sidebar} onChange={e=>setLayout(current=>({...current,sidebar:e.target.checked}))}/></label>
      <label className="settings-row"><span>Show supporting files</span><input type="checkbox" checked={showAllFiles} onChange={e=>setShowAllFiles(e.target.checked)}/></label>
      <h3>Panels</h3>{(['latex','graph','agent'] as Tool[]).map(tool=><label className="settings-row" key={tool}><span>{tool==='latex'?'Notes':tool==='graph'?'Graph':'Agent'}</span><input type="checkbox" checked={tools.includes(tool)} onChange={event=>event.target.checked?openTool(tool):closeTool(tool)}/></label>)}
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
