import { useEffect, useState } from "react";
import { getProjectFile, getProjectFiles, saveProjectFile } from "./api/client";
import FileTree from "./components/FileTree";
import Editor from "@monaco-editor/react";


function App()
{
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [error, setError] = useState("");

  useEffect(() =>
  {
    getProjectFiles("Test Project")
      .then(setFiles)
      .catch(() => setError("Failed to load project files"));
  }, []);

  function handleFileSelect(file: string)
  {
    setSelectedFile(file);
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
            <h2>{selectedFile}</h2>

            <button onClick={handleSave}>
              Save
            </button>

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
      </main>
    </div>
  );
}


export default App;