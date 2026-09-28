import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

import {
  compileProjectFile,
  getProjectFile,
  getProjectFiles,
  saveProjectFile,
} from "./api/client";

import FileTree from "./components/FileTree";


function App()
{
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [pdfVersion, setPdfVersion] = useState(0);
  const [error, setError] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);

  useEffect(() =>
  {
    getProjectFiles("Test Project")
      .then(setFiles)
      .catch(() => setError("Failed to load project files"));
  }, []);

  function handleFileSelect(file: string)
  {
    setSelectedFile(file);
    setPdfPath("");
    setError("");

    getProjectFile("Test Project", file)
      .then(setFileContent)
      .catch(() => setError("Failed to load file"));
  }

  async function handleSave()
  {
    if (!selectedFile)
    {
      return;
    }

    try
    {
      await saveProjectFile(
        "Test Project",
        selectedFile,
        fileContent
      );
    }
    catch
    {
      setError("Failed to save file");
    }
  }

  async function handleCompile()
  {
    if (!selectedFile)
    {
      return;
    }

    try
    {
      setIsCompiling(true);
      setError("");

      await handleSave();

      const pdf = await compileProjectFile(
        "Test Project",
        selectedFile
      );

      setPdfPath(pdf);
      setPdfVersion(Date.now());
    }
    catch
    {
      setError("Failed to compile LaTeX file");
    }
    finally
    {
      setIsCompiling(false);
    }
  }

  const pdfUrl = pdfPath
    ? `http://127.0.0.1:8000/api/projects/Test%20Project/pdf/${pdfPath}?v=${pdfVersion}`
    : "";

  return (
    <div className="app">
      <header className="header">
        <h1>StarView</h1>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <h2>Test Project</h2>

          {error && <p>{error}</p>}

          <FileTree
            files={files}
            onFileSelect={handleFileSelect}
          />
        </aside>

        <section className="editor">
          {selectedFile ? (
            <>
              <div className="editor-header">
                <h2>{selectedFile}</h2>

                <div className="editor-actions">
                  <button onClick={handleSave}>
                    Save
                  </button>

                  <button
                    onClick={handleCompile}
                    disabled={isCompiling}
                  >
                    {isCompiling ? "Compiling..." : "Compile"}
                  </button>
                </div>
              </div>

              <Editor
                height="80vh"
                defaultLanguage="latex"
                theme="vs-dark"
                value={fileContent}
                onChange={(value) => setFileContent(value ?? "")}
              />
            </>
          ) : (
            <p>Select a file to begin editing.</p>
          )}
        </section>

        <section className="preview">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title="PDF Preview"
            />
          ) : (
            <p>Compile a LaTeX file to preview the PDF.</p>
          )}
        </section>
      </main>
    </div>
  );
}


export default App;