# StarView

StarView is a local-first knowledge and document workspace inspired by Obsidian and Overleaf.

## Vision

StarView combines:

- LaTeX document editing and formatting
- Local project and file management
- Visual knowledge graphs
- Neo4j-backed knowledge representation
- GraphRAG for analyzing and working with project knowledge
- Connectors for external data sources such as Excel, Google Sheets, MongoDB, and SQL databases
- AI-assisted document generation, analysis, and management

## Current Goal

Build a local-first Overleaf-style workspace capable of:

- Creating projects
- Opening existing local projects
- Creating and editing LaTeX files
- Managing project files
- Compiling LaTeX documents
- Viewing compiled PDFs
- Displaying LaTeX compilation errors

## Architecture

The filesystem is the source of truth.

```text
                    StarView

                 React Frontend
                       |
                       v
                  FastAPI API
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
   Filesystem       LaTeX         Future
   Management       Compiler      Services
        |              |              |
        v              v              v
     .tex/.bib       PDF          Neo4j
     images/etc.                  GraphRAG
                                  Plugins

## Connected LaTeX workspace

Open a local folder, then select a `.tex` document. In **Connections**, choose another document and click **Link**. Links are directed: the destination shows a backlink to the source. Click a graph node or a connection to open its document; the remove button deletes only the connection. Links persist in `.starview/links.json`, without editing LaTeX source. If a file is moved or deleted, its old links are marked missing and can be removed and recreated.

The explorer defaults to LaTeX sources, bibliography/style files, and image assets. Generated files are hidden; **Show all files** reveals other existing project files. Internal `.starview`, `.git`, environments, and dependency folders are always omitted. Click a supported image or an imported PDF to preview it.

Choose **Main document** in the editor footer. Compile saves the current file and builds that main document, including when an included chapter is selected. New output is isolated under `.starview/build/<document path without extension>/`. Existing generated files are kept in place. Source paths are relative to the project root; subfolder documents should use project-relative paths for included resources.

### Run locally

Start the backend from `backend` with `uvicorn app.main:app --reload` in your Python environment. Start the frontend from `frontend` with `npm install` and `npm run dev`. MacTeX or TeX Live with `latexmk` is required for PDF builds. Project registration is still in memory; reopen the folder after a backend restart. Connections remain on disk.

### Validation

From `backend`, install `requirements-test.txt` and run `python -m unittest discover -s tests -v`. From `frontend`, run `npm run build`.



## Themed reader and keyword links

Compiled and imported PDFs render directly in StarView with selectable text, workspace colors, and no browser PDF toolbar. Focus reading expands the document; Show editor restores the split view. Original colors lets you inspect the unthemed document without altering the PDF file. The local PDF.js worker is bundled with the frontend.

Write `[[research]]` to link to research.tex or `[[research|research notes]]` to give the link a readable label. Relative paths and full project-relative paths are supported; use an explicit path when filenames are ambiguous. Cmd/Ctrl-click a link in the editor, use Cmd/Ctrl-Enter with the cursor on it, or click a Document links chip. After saving, these links also appear in the graph and backlinks. Edit the source to remove an inline connection.

In a compiled preview, click a highlighted keyword to open its destination. Standalone documents are compiled and rendered automatically; included fragments open in the editor/Connections view. Missing or ambiguous links stay plain text in the PDF and are marked unresolved in the editor. Comments, verbatim/listing blocks, and inline verb examples do not create links.

`[[...]]` is a StarView extension to LaTeX. StarView transforms it to hyperref links in a temporary project copy and keeps original sources unchanged. External LaTeX tools will display the bracket syntax until you replace it with standard LaTeX links. Projects without keyword links retain the normal build path. Install frontend dependencies with `npm install` after pulling this update.

### Folder picking, labels, and motion

Open Folder launches the local computer's native folder chooser (macOS Finder, Windows folder dialog, or Tk on Linux). Cancellation leaves the workspace unchanged. Browse folders is available as a fallback. This opens the folder in place; files are not uploaded.

Every file receives its immediate containing folder as an automatic tag; root-level files use the project folder name. Add multiple custom tags beneath the filename, and remove them with ×. Labels persist in `.starview/tags.json`. Filter by tag narrows both the explorer and the document graph.

Opening a standalone LaTeX file selects it for compilation and displays its newly built PDF. Chapter fragments retain the selected main document. Loading pages stay workspace-colored until rendering finishes, then fade in. Graph hover effects and flowing active connections respect reduced-motion preferences.

### Graph exploration

Expand the graph for a floating force layout with folder clusters, node separation, and curved directed connections. Drag nodes to pin them temporarily, drag the background to pan, and scroll to zoom. Fit restores the whole graph; Reflow releases pins and rearranges it. Pause stops motion, and reduced-motion preferences start it paused. Hover or focus a node to see its full title, path, tags, and connection count. Click a node to open its document.

Search titles, paths, or tags; filter by tag or relationship; focus on one- or two-hop neighbors of the selected document; and hide isolated nodes. File search is also available in the explorer.

Click a connection to edit multiple relationship labels such as references and examples, and choose its color. Colors & legend sets colors for tags, relationship categories, or individual documents using the workspace palette. Auto restores automatic coloring. Labels and colors persist in .starview/graph.json without changing LaTeX sources. Inline connections default to references; manual connections default to related.

From frontend, run npm test for layout and neighborhood tests, npm run lint, and npm run build. Data nodes and dashboard hubs are reserved for the next phase.
