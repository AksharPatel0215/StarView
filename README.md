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

Start the backend from `backend` with `uvicorn app.main:app --reload` in your Python environment. Start the frontend from `frontend` with `npm install` and `npm run dev`. MacTeX or TeX Live with `latexmk` is required for PDF builds. Projects are remembered in the private local account directory; connections remain in the project folder.

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

## Private local accounts and flexible workspaces

StarView runs on your own computer with one owner account. On first launch, create a name and a password of at least 12 characters. Subsequent visits require sign-in. The API, local file browsing, PDFs, images, workspace metadata, and account connections require an authenticated session. Account settings lets you change your password; changing it invalidates other sessions.

Account data lives in `~/.local/share/starview` by default (override with `STARVIEW_DATA_DIR`). Passwords use salted scrypt hashes, session cookies are HttpOnly and SameSite=Lax, and sessions expire after 12 hours. Mutations require an allowed Origin and a session CSRF token. Login failures are throttled. OAuth state is single-use, expires after ten minutes, and is tied to the initiating local session; both providers use PKCE. Cloud tokens are encrypted on disk with a private local key. Keep the data directory and key private; this protects against web access, not someone who controls your OS account.

The backend rejects non-loopback clients and unknown hosts. Keep it bound to `127.0.0.1`; this release is not a hosted multi-user server. LaTeX builds disable shell escape and project latexmk configuration. Only compile documents you trust: this does not sandbox TeX against the filesystem.

Start after pulling:

```sh
# Terminal 1, from backend (with your Python environment active)
pip install -r requirements.txt
# Optional: copy .env.example to .env, fill in OAuth app settings
uvicorn app.main:app --host 127.0.0.1 --reload --env-file .env

# Terminal 2, from frontend
npm install
npm run dev
```

If not configuring cloud accounts yet, omit `--env-file .env`. Open **http://127.0.0.1:5173/**. The frontend proxies `/api` to port 8000, so credentials stay on the same origin. Avoid mixing localhost and 127.0.0.1. A custom `VITE_API_URL` must use the same hostname; set `STARVIEW_API_ORIGIN` and `STARVIEW_ORIGIN` to match the ports you actually use. No credentials belong in `VITE_` variables. For a packaged production frontend, serve it behind a same-origin local proxy to this API; Vite's proxy is for development.

**Files**, **Workspace**, and **Inspector** toggle panels without discarding the open document. Drag the dividers to resize; arrow keys work when a divider is focused. Layout preferences are saved in this browser, and Reset layout restores defaults. Open documents have closable tabs; closing an unsaved document prompts before discarding edits. Overview gives live counts, top connected documents, and topic distribution.

### Dashboard and data nodes

Create a dashboard hub, choose its connected LaTeX documents and data nodes, and open it from the sidebar or graph. Its statistics describe those direct connections; it does not recursively count an entire reachable graph. New documents need to be connected to the hub explicitly. Create a data node by browsing a connected account, choosing a supported resource, and linking it to documents or other workspace nodes. Edit node & connections changes its title and links. Nodes persist in `.starview/nodes.json`; graph labels and colors also work for them. Cloud document contents are fetched when viewed, without making copies in the notes folder.

Google Docs render as PDF in the themed reader. Google Sheets and Excel `.xlsx` files display up to 20 sheet tabs, 200 rows, and 30 columns; spreadsheet formulas show saved results, without executing formulas. OneDrive Word `.docx` files use the themed reader when Microsoft can convert them to PDF; a text preview is the fallback. Word files uploaded to Google Drive use a text preview, without reproducing layout or images. PDFs are supported too. Refresh fetches current provider content. Previews accept files up to 20 MB and reject oversized Office archives. Disconnect removes locally stored provider tokens and makes its data nodes unavailable until reconnected. To revoke the provider's consent grant too, remove StarView from that provider's connected-app settings.

### Connected accounts: one-time OAuth setup

This repository does not ship provider credentials. Register your own web OAuth applications, keep their secrets only in the backend `.env`, and restart the backend after changing them. The frontend shows a setup message until a provider is configured. Live account authorization must be completed by the user in the provider's sign-in and consent screens.

**Google:** Create a Google Cloud OAuth consent screen and a Web application OAuth client, enable the Drive API, and register `http://127.0.0.1:8000/api/accounts/google/callback` as the redirect URI. Set `STARVIEW_GOOGLE_CLIENT_ID` and `STARVIEW_GOOGLE_CLIENT_SECRET`. Configure your Google account as a test user while the app is in testing. StarView requests `https://www.googleapis.com/auth/drive.readonly` to browse and export supported files; this is read access to your Drive, not just a single selected file. Public distribution of this restricted scope can require Google's verification. [Google OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server).

**Microsoft:** Register an application that supports personal Microsoft accounts and, optionally, work/school accounts. Add a Web redirect URI `http://127.0.0.1:8000/api/accounts/microsoft/callback`, create a client secret, and set `STARVIEW_MICROSOFT_CLIENT_ID` and `STARVIEW_MICROSOFT_CLIENT_SECRET`. Use delegated `Files.Read` and `offline_access` scopes. This reads the signed-in user's OneDrive; tenant administrators can restrict consent. [Microsoft authorization flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).

In StarView choose **+ Data node**, select the provider, then **Connect account**. After consent returns you to StarView, reopen the project and data-node picker to choose your resource. Each provider currently connects one account at a time. Tokens remain on the local backend; provider failures and revoked permissions require reconnecting. End-to-end live provider access requires valid app registrations and user consent; automated tests use mocked provider responses.

The editor and PDF workers are bundled locally; the UI no longer fetches its editor runtime or fonts from a CDN. API responses use a restrictive content policy so directly opening an imported SVG cannot execute scripts in the app origin. The frontend pins a patched DOMPurify and routes Monaco's embedded sanitizer import to it. Dependency audits and security tests are useful checks, not a guarantee or a substitute for an independent security review.

### Creating and linking documents

Click **+ New document**, choose a folder, and enter a name. The .tex extension is added automatically; a name such as Examples/first-example creates a subfolder. StarView creates a standalone LaTeX template and opens it immediately. Existing files cannot be overwritten through this action.

In the LaTeX editor, type **[[** to suggest known documents. Search by title or path, choose with the arrow keys, and press Enter to insert the complete link. Paths are relative to the current document so duplicate filenames in different folders remain unambiguous. Suggestions update when documents are created or the workspace is refreshed. Comments, verbatim blocks, and link aliases do not trigger suggestions.

### A quieter writing workspace

The main toolbar keeps New document and Graph within reach. The Workspace menu holds folder opening, the overview, and dashboard/data-node creation; View controls panel visibility and reset. Files remain searchable, with tags and maintenance actions under Filter. References, PDFs, document tags, link lists, and compile settings expand when needed.

Create a file with the toolbar button, the + beside Documents, or Alt+N. The creation dialog focuses the name and keeps the location selector in a disclosure. New documents compile themselves by default. The inspector starts hidden for new layouts; compiling or opening an image/PDF reveals the preview. Existing saved layouts are preserved.

### Appearance and settings

Settings offers five readable palettes: the original StarView, light Paper, cool Slate, green Forest, and plum Dusk. The interface, locally bundled editor, and themed PDF pages change together. Original PDF colors remain available in the reader. Preferences persist in this browser and also apply to the login screen.

Adjust editor text size and line wrapping, reduce motion, restore appearance defaults, or reset the workspace layout. Reduced motion pauses the floating graph and disables UI animation; operating-system reduced-motion preferences remain respected. Account/password and provider connections retain their existing dedicated controls.
