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
