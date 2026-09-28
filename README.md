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