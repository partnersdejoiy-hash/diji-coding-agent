# DEJOIY-CodeAgent

Production-grade AI coding platform — a Cursor-level coding assistant for understanding, editing, generating, refactoring, debugging, and managing entire codebases.

## Features

- **AI Agent** — ReAct architecture with autonomous task execution
- **Monaco Editor** — VS Code-style editor with tabs, syntax highlighting, search/replace
- **File Explorer** — Full CRUD for files and folders with real-time updates
- **Semantic Search** — ChromaDB-powered RAG across your codebase
- **Terminal** — Sandboxed command execution (npm, pytest, go test, etc.)
- **Git Integration** — Status, diff, branch, checkout, commit with preview
- **Multi-Mode Chat** — Chat, Ask, Agent, Refactor, Explain modes
- **Memory System** — Short-term session memory and long-term project knowledge
- **17 Agent Tools** — File ops, search, terminal, git, tests, embeddings, and more
- **Security** — JWT auth, RBAC, rate limiting, sandboxed terminal

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Monaco Editor, Zustand, React Query |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Vector DB | ChromaDB |
| AI | OpenAI API (GPT-4o, o1, embeddings) |
| Infrastructure | Docker, Docker Compose, Nginx |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Setup

```bash
# Clone and install
git clone <repo-url>
cd dejoiy-codeagent
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start infrastructure
docker compose up postgres chroma -d

# Setup database
pnpm db:push

# Start development
pnpm dev
```

Open http://localhost:3000 — register an account, create a workspace, and start coding with AI.

### Configure OpenAI

Go to Settings and enter your OpenAI API key. Select your preferred model and autonomy level.

## Project Structure

```
apps/web/          → Next.js frontend
apps/api/          → Express API
packages/          → Shared agent packages
database/          → Prisma schema
docker/            → Container configuration
docs/              → Architecture documentation
```

## Agent Tools

`read_file`, `write_file`, `edit_file`, `create_file`, `delete_file`, `rename_file`, `read_directory`, `search_code`, `run_terminal_command`, `git_status`, `git_diff`, `git_commit`, `run_tests`, `create_embedding_search`, `project_summary`, `dependency_analysis`, `documentation_generator`

## Docker Deployment

```bash
docker compose up -d
```

Access via http://localhost (nginx reverse proxy).

## License

Private — All rights reserved.
