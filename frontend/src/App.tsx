import { useEffect, useState } from "react";
import { getProjectFiles } from "./api/client";
import FileTree from "./components/FileTree";


function App()
{
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() =>
  {
    getProjectFiles("Test Project")
      .then(setFiles)
      .catch(() => setError("Failed to load project files"));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>StarView</h1>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <h2>Test Project</h2>

          {error && <p>{error}</p>}

          <FileTree files={files} />
        </aside>

        <section className="editor">
          <p>Select a file to begin editing.</p>
        </section>
      </main>
    </div>
  );
}


export default App;