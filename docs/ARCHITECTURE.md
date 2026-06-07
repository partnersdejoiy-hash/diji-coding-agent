# DEJOIY-CodeAgent Architecture

## Overview

DEJOIY-CodeAgent is a production-grade AI coding platform built as a monorepo with a Next.js frontend, Express API backend, and modular agent packages. It provides Cursor-level capabilities for codebase understanding, editing, refactoring, and autonomous task execution.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Explorer │  │ Monaco Editor│  │   Chat   │  │Terminal │ │
│  └──────────┘  └──────────────┘  └──────────┘  └─────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / SSE / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                     Express API (apps/api)                    │
│  Auth │ Workspaces │ Files │ Agent │ Terminal │ Git │ Settings│
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
│  Agent Core   │  │   Workspace   │  │   Embeddings  │
│  (ReAct Loop) │  │    Engine     │  │   (ChromaDB)  │
└───────┬───────┘  └───────────────┘  └───────────────┘
        │
┌───────▼───────────────────────────────────────────────┐
│                    Tool Registry                        │
│  read/write/edit files │ terminal │ git │ search │ RAG │
└───────────────────────────────────────────────────────┘
        │
┌───────▼───────┐  ┌───────────────┐  ┌───────────────┐
│  PostgreSQL   │  │   ChromaDB    │  │  File System  │
│  (Prisma ORM) │  │  (Vectors)    │  │  (Workspaces) │
└───────────────┘  └───────────────┘  └───────────────┘
```

## Monorepo Structure

```
dejoiy-codeagent/
├── apps/
│   ├── web/          # Next.js 15 frontend
│   └── api/          # Express API server
├── packages/
│   ├── agent-core/   # ReAct agent loop, planner, context engine
│   ├── memory/       # Short-term and long-term memory
│   ├── tools/        # Tool registry (17 tools)
│   ├── prompts/      # System prompts for all modes
│   ├── embeddings/   # ChromaDB indexing and semantic search
│   ├── git-engine/   # Git operations
│   ├── terminal-engine/ # Sandboxed command execution
│   └── workspace-engine/ # File system operations
├── database/         # Prisma schema and client
└── docker/           # Docker and nginx configuration
```

## Agent Architecture (ReAct)

The agent follows a Reasoning + Acting loop:

1. **Planner** — Analyzes the user request and creates a structured execution plan
2. **Context Engine** — Collects current file, imports, related files, and semantic matches
3. **Tool Selection** — OpenAI function calling selects appropriate tools
4. **Tool Execution** — Tools modify files, run commands, search code, etc.
5. **Observation** — Results are fed back to the model
6. **Reflection** — Agent evaluates progress and decides next steps
7. **Completion** — Loop continues until task is done or max steps reached

## Memory System

### Short-Term Memory
- Current task description
- Active file list
- Conversation history (last 50 messages)
- Stored per session in PostgreSQL

### Long-Term Memory
- Project patterns and conventions
- User preferences
- Architecture knowledge
- Categorized and retrievable per user/workspace

## RAG Pipeline

1. Workspace opens → indexing job starts
2. All supported files are scanned
3. Code is chunked intelligently (1500 chars, 200 overlap)
4. Embeddings generated via OpenAI text-embedding-3-small
5. Vectors stored in ChromaDB per workspace
6. Embedding cache in PostgreSQL prevents re-generation
7. Semantic search returns ranked file chunks

## Security

- JWT authentication with RBAC (Admin, Developer, Viewer)
- Rate limiting on all endpoints
- Sandboxed terminal with command allowlist
- Path traversal prevention on file operations
- Secret redaction in API responses
- Helmet.js security headers
- CORS configuration
- API keys stored server-side only

## Supported Languages

JavaScript, TypeScript, React (JSX/TSX), Python, PHP, Java, Go, Rust, JSON, YAML, Markdown, HTML, CSS, SCSS

## Chat Modes

| Mode | Description |
|------|-------------|
| Chat | General conversation with codebase context |
| Ask | Q&A without file modifications |
| Agent | Autonomous task execution with tools |
| Refactor | Multi-file refactoring operations |
| Explain | Code explanation and documentation |

## Deployment

```bash
# Development
pnpm install
cp .env.example .env
docker compose up postgres chroma -d
pnpm db:push
pnpm dev

# Production
docker compose up -d
```

Services: PostgreSQL (5432), ChromaDB (8000), API (4000), Web (3000), Nginx (80)
