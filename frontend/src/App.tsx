import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { browseDirectories, compileProjectFile, getPdfUrl, getProjectFile, getProjectFiles, getProjects, openProject, saveProjectFile } from "./api/client";
import type { DirectoryListing, Project } from "./api/client";
import FileTree from "./components/FileTree";

const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
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
      const nextFiles = await getProjectFiles(next.name);
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
      const nextFiles = await getProjectFiles(next.name);
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
    setLoadingFile(true); setError("");
    try {
      if (file.toLowerCase().endsWith(".pdf")) {
        if (id !== fileRequest.current) return;
        setSelectedFile(""); setFileContent(""); setSavedContent("");
        setPdfPath(file); setPdfVersion(Date.now());
      } else {
        const content = await getProjectFile(project.name, file);
        if (id !== fileRequest.current) return;
        setSelectedFile(file); setFileContent(content); setSavedContent(content); setPdfPath("");
      }
    } catch (e) { if (id === fileRequest.current) setError(message(e)); }
    finally { if (id === fileRequest.current) setLoadingFile(false); }
  }

  async function save(compile = false) {
    if (!project || !selectedFile || busy || loadingFile) return;
    setBusy(true); setError("");
    try {
      await saveProjectFile(project.name, selectedFile, fileContent);
      setSavedContent(fileContent);
      if (compile) {
        setPdfPath(await compileProjectFile(project.name, selectedFile));
        setPdfVersion(Date.now());
        setFiles(await getProjectFiles(project.name));
      }
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return <div className="app">
    <header className="header"><h1>StarView</h1>
      <button disabled={busy || loadingFile} onClick={() => { setShowBrowser(true); void browse(project?.root); }}>Open Folder</button>
      {projects.length > 0 && <select aria-label="Open project" value={project?.name || ""} disabled={busy || loadingFile} onChange={e => {
        const next = projects.find(item => item.name === e.target.value); if (next) void selectProject(next);
      }}><option value="" disabled>Select a project</option>{projects.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select>}
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    <main className="workspace">
      <aside className="sidebar"><h2>{project?.name || "No folder open"}</h2>
        {project && <><p className="project-root" title={project.root}>{project.root}</p>
          <button disabled={busy || loadingFile} onClick={() => { setBusy(true); getProjectFiles(project.name).then(setFiles).catch(e => setError(message(e))).finally(() => setBusy(false)); }}>Refresh files</button>
          <FileTree files={files} onFileSelect={file => void selectFile(file)} />
          {files.length === 0 && <p>This folder has no files.</p>}</>}
        {!project && <p>Open a local folder to browse its files.</p>}
      </aside>
      <section className="editor">
        {loadingFile && <p role="status">Opening file…</p>}
        {selectedFile ? <><div className="editor-header"><h2>{selectedFile}{dirty ? " *" : ""}</h2>
          <div className="editor-actions"><button disabled={busy || loadingFile} onClick={() => void save()}>Save</button>
          {selectedFile.toLowerCase().endsWith(".tex") && <button disabled={busy || loadingFile} onClick={() => void save(true)}>Compile</button>}</div></div>
          <Editor height="75vh" path={`${project?.name}/${selectedFile}`} language={selectedFile.endsWith(".tex") ? "latex" : "plaintext"} theme="vs-dark" value={fileContent} options={{ readOnly: busy || loadingFile }} onChange={value => setFileContent(value ?? "")} />
        </> : <p>Select a text file to edit, or a PDF to preview.</p>}
      </section>
      <section className="preview">{project && pdfPath ? <iframe src={getPdfUrl(project.name, pdfPath, pdfVersion)} title="PDF Preview" /> : <p>Compile a LaTeX file or open a PDF to preview it.</p>}</section>
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
