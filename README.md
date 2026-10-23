# StarView

StarView is a local-first LaTeX workspace with linked notes, PDF previews, a constellation graph, flashcards, dashboards, and an evidence-backed notes assistant. Your project folder remains the source of truth.

## What works today

- Open local folders, create and edit LaTeX documents, and keep several documents in tabs.
- Compile a main document with `latexmk`, inspect errors, and read PDFs beside the editor.
- Link notes with `[[path/to/note|Label]]`, follow backlinks, label relationships, and explore the graph.
- Organize notes through dashboards and a unified workspace explorer; practice with flashcard sets.
- Resize and focus the Notes, Graph, and Agent panels. Layout and appearance preferences stay in the browser.
- Ask questions grounded in current notes or request complete note drafts and connection proposals. Review and approve proposals before they modify files.
- Optionally preview supported resources from Google Drive and OneDrive. See [connected-account setup](docs/connected-accounts.md).

Topic Map guide documents remain accessible in the explorer but are omitted from the graph. Workspace nodes use filled circles rather than hollow rings. Other node shapes distinguish sections, theorems, methods, examples, flashcards, and data.

## Requirements

- Python 3.11 or newer and Node.js 22.12 or newer.
- A TeX distribution providing `latexmk` and the packages used by your documents, such as MacTeX or TeX Live, for compilation.
- [Ollama](https://ollama.com/) for local embeddings and the default DeepSeek assistant.

## Run locally

From the repository root, set up the backend:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --env-file .env
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open <http://127.0.0.1:5173/> and create the local owner account. Use `127.0.0.1` consistently: the frontend proxies `/api` to the backend on port 8000. Avoid mixing `localhost` and `127.0.0.1` in the browser and OAuth configuration.

Prepare the local agent separately:

```sh
ollama pull deepseek-r1:7b
ollama pull embeddinggemma
```

Ollama must be running when you use the assistant. The models are downloads, not repository dependencies. Larger chat models can be selected if your machine supports them.

## Assistant and retrieval

DeepSeek through Ollama is the default when local chat models are available, including when a Gemini key is configured. Select **Automatic** to use the local default, or choose a model in Agent settings. `STARVIEW_OLLAMA_MODEL`, `STARVIEW_OLLAMA_FAST_MODEL`, and `STARVIEW_EMBED_MODEL` override the local defaults.

The answer pipeline:

1. Read clean, section-aware passages from current notes, preserving source paths and line spans. Exclude diagrams, title commands, and navigation lists from evidence.
2. Combine local EmbeddingGemma semantic retrieval with BM25 keyword retrieval. Ordinary searches are reranked by the selected chat model; explicit comparisons retrieve the two named subjects separately.
3. Generate explanatory paragraphs with passage references. For comparisons, require references to both subjects. The application attaches source text and checks it against the current files.
4. Run model-based evidence and hypothesis checks, then render supported content with citations and an expandable retrieved-passages list.

Questions comparing methods use the comparison workflow rather than graph-path traversal. Explicit connection questions can use existing concept paths. A new question does not inherit an unrelated comparison from conversation history.

Create, edit, and connect requests follow a separate proposal workflow. New-note creation can proceed when related-note retrieval is unavailable, with an explicit notice that the draft lacks retrieved citations. Drafts include complete LaTeX source, can be previewed and edited, and are applied only after approval.

Grounding checks are model-based, not formal proofs. Models can omit conditions, misread sources, or fail to complete. Review mathematical arguments and proposed edits. First queries can be slower while models load. Content-addressed embedding and verified-explanation caches live in the private application directory; source changes invalidate relevant cached entries.

### Optional Gemini

Set `GEMINI_API_KEY` in the backend environment, or store an `api_key` and optional `model` in the private application's `gemini.json`. `STARVIEW_GEMINI_MODEL` overrides that model. Restrict the configuration file to owner read/write access. Never commit keys or expose them through `VITE_` variables.

When selected, Gemini receives retrieved passages and relevant conversation context; draft requests can also include a note catalog and a style example. Embeddings still use local Ollama. If no local chat model is available, a configured Gemini model is offered as the default. Provider quotas and data terms apply.

Temporary Gemini transport errors and HTTP 500/502/503/504 responses receive up to three attempts with short backoff delays. Authentication, quota, and invalid-request failures are reported directly. Persistent failures do not silently switch models or bypass grounding.

## Project data and security

- Notes, bibliography files, images, and imported documents stay in the folder you open.
- `.starview/links.json` stores explicit directed links; inline `[[...]]` links remain in source files.
- `.starview/tags.json`, `graph.json`, and `nodes.json` hold labels, appearance, dashboards, flashcards, and workspace metadata.
- Builds go under `.starview/build/`; StarView transforms keyword links in temporary compilation copies rather than rewriting your originals.
- File moves update references. Workspace trash provides recovery for supported deletion actions.
- Local account data, encrypted provider tokens, model configuration, and caches default to `~/.local/share/starview`. Override with `STARVIEW_DATA_DIR` and keep that directory private.

The API requires a local authenticated session, an allowed Origin, and CSRF protection for mutations. Passwords use salted scrypt hashes. Keep the backend bound to loopback; this is a local application, not a hosted multi-user service. TeX compilation disables shell escape but is not a filesystem sandbox: compile trusted documents.

## Code layout

```text
backend/
  app/api/          Local authenticated endpoints
  app/core/         Files, links, compilation, accounts, retrieval, grounding
  app/services/     Agent routing and draft generation
  tests/            Backend regression tests
  evals/            Small reviewed mathematical grounding evaluation set
  starview_mcp.py   Optional local notes MCP server
frontend/
  src/components/   Editor, reader, graph, dashboards, flashcards, agent
  src/              Layout, graph behavior, API client, preferences
  tests/            Frontend behavior tests
```

For the optional notes MCP server, run `backend/.venv/bin/python backend/starview_mcp.py --workspace /absolute/path/to/notes` from the repository root. It supports retrieval and staged proposals; proposed changes still require approval in StarView.

## Validation

```sh
cd backend
source .venv/bin/activate
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -v
```

```sh
cd frontend
npm test
npm run lint
npm run build
```

Backend tests mock cloud services; they do not establish live provider availability. For the separate grounding evaluation, run `PYTHONPATH=. .venv/bin/python evals/evaluate_grounding.py --model deepseek-r1:7b` from `backend`. Inspect false accepts and false rejects separately; the small evaluation set is not a correctness guarantee.

Neo4j storage, a hosted service, and additional database connectors are future work, not dependencies of this release.
