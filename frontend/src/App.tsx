import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { browseDirectories, compileProjectFile, getPdfUrl, getConnections, connectDocuments, getAssetUrl, getProjectFile, getProjectFiles, getProjects, openProject, saveProjectFile } from "./api/client";
import type { DirectoryListing, Project, KnowledgeGraph } from "./api/client";
import FileTree from "./components/FileTree";
import Connections from "./components/Connections";

const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraph>({ documents: [], links: [] });
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [panel, setPanel] = useState<"connections" | "preview">("connections");
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
  const fileRequest = useRef(0);
  const browseRequest = useRef(0);
  const dirty = selectedFile !== "" && fileContent !== savedContent;

  useEffect(() => { getProjects().then(setProjects).catch(e => setError(message(e))); }, []);

  function loadGraph(next: KnowledgeGraph, reset = false) {
    setGraph(next);
    setBuildDocument(current => !reset && (!current || next.documents.some(node => node.path === current && node.is_main)) ? current : next.documents.find(node => node.path === "main.tex" && node.is_main)?.path || next.documents.find(node => node.is_main)?.path || "");
  }

  async function refresh() {
    if (!project || busy) return;
    setBusy(true); setError("");
    try {
      const [nextFiles, nextGraph] = await Promise.all([getProjectFiles(project.name), getConnections(project.name)]);
      setFiles(nextFiles); loadGraph(nextGraph);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function connect(source: string, target: string, remove = false) {
    if (!project || busy) return;
    setBusy(true); setError("");
    try {
      setGraph(await connectDocuments(project.name, source, target, remove));
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
      setProject(next); setFiles(nextFiles);
      setSelectedFile(""); setFileContent(""); setSavedContent(""); setPdfPath("");
      setShowBrowser(false);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); setLoadingFile(false); }
  }

  async function openFolder() {
    if (!listing || browsing || !canLeave()) return;
    setBusy(true); setBrowserError("");
    try {
      const known = await getProjects();
      let next = known.find(item => item.root === listing.path);
      if (!next) {
        const base = listing.path.split("/").filter(Boolean).pop() || "Root";
        let name = base; let suffix = 2;
        while (known.some(item => item.name === name)) name = `${base} (${suffix++})`;
        next = await openProject(name, listing.path);
      }
      const [nextFiles, nextGraph] = await Promise.all([getProjectFiles(next.name), getConnections(next.name)]);
      loadGraph(nextGraph, true); setAssetPath(""); setStatus("");
      ++fileRequest.current;
      setProjects(await getProjects()); setProject(next); setFiles(nextFiles);
      setSelectedFile(""); setFileContent(""); setSavedContent(""); setPdfPath("");
      setError(""); setShowBrowser(false); setLoadingFile(false);
    } catch (e) { setBrowserError(message(e)); }
    finally { setBusy(false); }
  }

  async function selectFile(file: string) {
    if (!project || busy || !canLeave()) return;
    const id = ++fileRequest.current;
    setLoadingFile(true); setError(""); setStatus("");
    try {
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(file)) {
        setAssetPath(file); setSelectedFile(""); setFileContent(""); setSavedContent(""); setPanel("preview");
      } else if (file.toLowerCase().endsWith(".pdf")) {
        if (id !== fileRequest.current) return;
        setSelectedFile(""); setFileContent(""); setSavedContent("");
        setPdfPath(file); setPdfVersion(Date.now()); setAssetPath(""); setPanel("preview");
      } else {
        const content = await getProjectFile(project.name, file);
        if (id !== fileRequest.current) return;
        setSelectedFile(file); setFileContent(content); setSavedContent(content); setAssetPath("");
      }
    } catch (e) { if (id === fileRequest.current) setError(message(e)); }
    finally { if (id === fileRequest.current) setLoadingFile(false); }
  }

  async function save(compile = false) {
    if (!project || !selectedFile || busy || loadingFile) return;
    setBusy(true); setError(""); setStatus(compile ? "Compiling…" : "Saving…");
    try {
      await saveProjectFile(project.name, selectedFile, fileContent);
      setSavedContent(fileContent);
      if (compile) {
        setPdfPath(await compileProjectFile(project.name, buildDocument || selectedFile));
        setPanel("preview"); setAssetPath("");
        setPdfVersion(Date.now());
        setFiles(await getProjectFiles(project.name));
      }
      loadGraph(await getConnections(project.name));
      setStatus(compile ? "Build complete" : "All changes saved");
    } catch (e) { setError(message(e)); setStatus("Action failed"); }
    finally { setBusy(false); }
  }

  const documents = files.filter(file => /\.tex$/i.test(file));
  const resources = files.filter(file => /\.(bib|bst|sty|cls|png|jpe?g|gif|webp|svg|eps)$/i.test(file));
  const pdfs = files.filter(file => /\.pdf$/i.test(file) && !documents.some(source => source.slice(0, -4) === file.slice(0, -4) || source.split("/").pop()?.slice(0, -4) === file.slice(0, -4)));
  const otherFiles = files.filter(file => !documents.includes(file) && !resources.includes(file) && !pdfs.includes(file));

  return <div className="app">
    <header className="header"><h1><span className="brand-mark" aria-hidden="true">✳</span>StarView</h1>
      <span className="tagline">A connected space for your ideas</span><span className="header-spacer" />
      {projects.length > 0 && <select aria-label="Open project" value={project?.name || ""} disabled={busy || loadingFile} onChange={e => {
        const next = projects.find(item => item.name === e.target.value); if (next) void selectProject(next);
      }}><option value="" disabled>Select a project</option>{projects.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}
      <button disabled={busy || loadingFile} onClick={() => { setShowBrowser(true); void browse(project?.root); }}>Open Folder</button>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    <main className="workspace">
      <aside className="sidebar"><h2>{project?.name || "Your workspace"}</h2>
        {project && <><p className="project-root" title={project.root}>{project.root}</p>
          <div className="sidebar-tools"><button disabled={busy || loadingFile} onClick={() => void refresh()}>↻ Refresh</button><button aria-pressed={showAllFiles} onClick={() => setShowAllFiles(!showAllFiles)}>{showAllFiles ? "Hide other files" : "Show all files"}</button></div>
          <p className="section-label">Documents · {documents.length}</p>
          <FileTree files={documents} selectedFile={selectedFile} onFileSelect={file => void selectFile(file)} />
          {documents.length === 0 && <p className="project-root">No LaTeX documents in this folder.</p>}
          {resources.length > 0 && <><p className="section-label">References & assets</p><FileTree files={resources} selectedFile={assetPath || selectedFile} onFileSelect={file => void selectFile(file)} /></>}
          {pdfs.length > 0 && <><p className="section-label">Imported PDFs</p><FileTree files={pdfs} selectedFile={pdfPath} onFileSelect={file => void selectFile(file)} /></>}
          {showAllFiles && <><p className="section-label">Other files</p><FileTree files={otherFiles} selectedFile={selectedFile} onFileSelect={file => void selectFile(file)} /></>}
        </>}
        {!project && <div className="empty-state"><p>Open a folder to bring your documents together.</p></div>}
      </aside>
      <section className="editor">
        <div className="editor-header"><h2>{selectedFile || assetPath || "Document workspace"}{dirty ? " • unsaved" : ""}</h2>
          {selectedFile && <div className="editor-actions"><button disabled={busy || loadingFile} onClick={() => void save()}>Save</button>
            {selectedFile.toLowerCase().endsWith(".tex") && <button className="primary" disabled={busy || loadingFile} onClick={() => void save(true)}>{busy ? "Working…" : "Compile ↗"}</button>}
          </div>}
        </div>
        {selectedFile ? <div className="editor-body"><Editor height="100%" path={`${project?.name}/${selectedFile}`} language={selectedFile.toLowerCase().endsWith(".tex") ? "latex" : "plaintext"} theme="starview" beforeMount={monaco => monaco.editor.defineTheme("starview", { base: "vs-dark", inherit: true, rules: [], colors: { "editor.background": "#191d26", "editorLineNumber.foreground": "#515c70", "editor.lineHighlightBackground": "#202631", "editor.selectionBackground": "#41365c" } })} value={fileContent} options={{ readOnly: busy || loadingFile, fontSize: 13, lineHeight: 23, minimap: { enabled: false }, padding: { top: 14 }, scrollBeyondLastLine: false, wordWrap: "on" }} onChange={value => setFileContent(value ?? "")} /></div>
          : <div className="empty-state"><div className="empty-icon" aria-hidden="true">✧</div><h2>{assetPath ? "Image preview" : "Make room for your ideas"}</h2><p>{assetPath ? "Your image is open in the preview panel." : "Choose a document to write, or explore how your LaTeX documents connect."}</p>{!project && <button className="primary" onClick={() => { setShowBrowser(true); void browse(); }}>Open a local folder</button>}</div>}
        <footer className="editor-status"><span role="status">{loadingFile ? "Opening file…" : status || (dirty ? "Unsaved changes" : "Ready")}</span>
          {project && <label>Main document <select aria-label="Main document" value={buildDocument} disabled={busy} onChange={e => setBuildDocument(e.target.value)}><option value="">Compile selected file</option>{graph.documents.filter(node => node.is_main).map(node => <option key={node.path} value={node.path}>{node.path}</option>)}</select></label>}
        </footer>
      </section>
      <section className="preview"><div className="panel-header"><button className={panel === "connections" ? "active" : ""} aria-pressed={panel === "connections"} onClick={() => setPanel("connections")}>Connections</button><button className={panel === "preview" ? "active" : ""} aria-pressed={panel === "preview"} onClick={() => setPanel("preview")}>Preview</button></div>
        {panel === "connections" ? <Connections graph={graph} selected={selectedFile} busy={busy || loadingFile} onOpen={file => void selectFile(file)} onConnect={(source, target, remove) => void connect(source, target, remove)} />
          : project && assetPath ? <img className="asset-preview" src={getAssetUrl(project.name, assetPath)} alt={assetPath} onError={() => setError("Could not load this image")} />
          : project && pdfPath ? <iframe src={getPdfUrl(project.name, pdfPath, pdfVersion)} title="PDF Preview" />
          : <div className="empty-state"><div className="empty-icon" aria-hidden="true">▤</div><h2>Your document, rendered</h2><p>Compile your main document to see its PDF here. Images and imported PDFs open here too.</p></div>}
      </section>
    </main>
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
