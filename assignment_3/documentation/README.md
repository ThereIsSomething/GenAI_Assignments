```
                                          
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   ███████╗███╗   ██╗ ██████╗          ║
  ║   ██╔════╝████╗  ██║██╔════╝          ║
  ║   █████╗  ██╔██╗ ██║██║  ███╗         ║
  ║   ██╔══╝  ██║╚██╗██║██║   ██║         ║
  ║   ███████╗██║ ╚████║╚██████╔╝         ║
  ║   ╚══════╝╚═╝  ╚═══╝ ╚═════╝          ║
  ║                                       ║
  ║   ██████╗  █████╗ ███╗   ███╗         ║
  ║   ██╔══██╗██╔══██╗████╗ ████║         ║
  ║   ██████╔╝███████║██╔████╔██║         ║
  ║   ██╔══██╗██╔══██║██║╚██╔╝██║         ║
  ║   ██║  ██║██║  ██║██║ ╚═╝ ██║         ║
  ║   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝         ║
  ║                                       ║
  ║   Document Intelligence               ║
  ║   ─────────────────────               ║
  ║   Grounded answers, not hallucinations║
  ║                                       ║
  ╚═══════════════════════════════════════╝

```

<br>

<div align="center">

**Engram** is a full-stack RAG (Retrieval-Augmented Generation) pipeline that lets you upload a document, ask questions about it, and get grounded, hallucination-free answers — powered by Nvidia NIM and Pinecone.

*Built for Assignment 03 — GenAI, Term VIII*

---

`Parse` → `Chunk` → `Embed` → `Store` → `Retrieve` → `Generate`

---

</div>

## ✦ What It Does

Upload a PDF. Ask anything. Get answers that cite **your** content — not the model's imagination.

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Upload   │────▶│  Parse   │────▶│  Chunk   │────▶│  Embed   │
│   PDF     │     │ (pdfjs)  │     │ (1000ch) │     │ (Nvidia) │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                         │
                                                         ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Response  │◀────│ Generate │◀────│ Retrieve │◀────│  Index   │
│ (stream)  │     │ (LLaMA)  │     │ (top-5)  │     │(Pinecone)│
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

## ✦ Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | Next.js 14, Tailwind CSS, React Markdown | UI, drag-and-drop upload, streaming chat |
| **Embeddings** | Nvidia NIM `nv-embedqa-e5-v5` | 1024-dim asymmetric embeddings |
| **Vector DB** | Pinecone (serverless, cosine) | Store and retrieve document chunks |
| **LLM** | Nvidia NIM `meta/llama-3.3-70b-instruct` | Grounded response generation via SSE |
| **Parser** | LangChain `PDFLoader` + `RecursiveCharacterTextSplitter` | PDF → text → 1000-char chunks |

## ✦ Getting Started

### Prerequisites

- Node.js ≥ 18
- Nvidia NIM API key → [build.nvidia.com](https://build.nvidia.com)
- Pinecone API key → [pinecone.io](https://www.pinecone.io)

### Setup

```bash
# Clone
git clone https://github.com/ThereIsSomething/GenAI_Assignments.git
cd GenAI_Assignments/assignment_3/shusync

# Install
npm install

# Environment
cp .env.example .env.local
```

Create `.env.local`:

```env
NVIDIA_API_KEY=your_nvidia_nim_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX=notebooklm
```

### Run

```bash
npm run dev
# → http://localhost:3000
```

### Pinecone Index Setup (first time only)

```bash
node setup-pinecone.mjs
# Creates a 1024-dim cosine index named "notebooklm"
```

## ✦ Architecture

```
assignment_3/shusync/
├── app/
│   ├── api/
│   │   ├── upload/route.ts    # PDF parse → chunk → embed → index
│   │   └── chat/route.ts      # Query embed → retrieve → generate (SSE)
│   ├── components/
│   │   └── WaveBackground.tsx  # Canvas particle animation
│   ├── globals.css             # Design tokens & animations
│   ├── layout.tsx              # Root layout, fonts, metadata
│   └── page.tsx                # Main UI (sidebar + chat)
├── setup-pinecone.mjs          # One-time index provisioning
├── tailwind.config.ts
└── package.json
```

## ✦ Key Design Decisions

### Why direct Nvidia NIM `fetch` instead of LangChain wrappers?

The `nv-embedqa-e5-v5` model is **asymmetric** — it requires `input_type: "passage"` for documents and `input_type: "query"` for questions. LangChain's `NvidiaEmbeddings` abstraction doesn't expose this parameter cleanly, so we use raw `fetch` calls to the NIM API for full control.

### Why `deleteAll()` before each upload?

Single-document context. When a user uploads a new PDF, the old vectors are purged to ensure retrieval stays grounded in the **current** document only. No cross-contamination.

### Why SSE streaming?

Perceived latency. The LLM response streams token-by-token to the client, so the user sees text appearing immediately rather than waiting for the full response.

## ✦ UI Features

- **Particle wave animation** — subtle canvas-based dot grid with mouse interaction
- **Drag-and-drop upload** — with real-time pipeline progress indicators
- **Markdown rendering** — headers, lists, code blocks, bold text in responses
- **Suggested questions** — one-click starter prompts after upload
- **Copy to clipboard** — quick-copy on any AI response
- **Session reset** — upload a new document without refreshing

## ✦ API Reference

### `POST /api/upload`

Accepts `multipart/form-data` with a PDF file.

```
Request:  FormData { file: <pdf> }
Response: { success: true, chunks: number, filename: string }
```

Pipeline: `PDF → text → split (1000ch / 200 overlap) → embed → upsert to Pinecone`

### `POST /api/chat`

Accepts JSON with a user message.

```
Request:  { message: string }
Response: SSE text/event-stream
```

Pipeline: `Query → embed (input_type: "query") → top-5 cosine retrieval → LLaMA 3.3 70B → stream`

## ✦ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | ✓ | Nvidia NIM API key for embeddings + LLM |
| `PINECONE_API_KEY` | ✓ | Pinecone vector database key |
| `PINECONE_INDEX` | ✓ | Pinecone index name (default: `notebooklm`) |

---

<div align="center">

```
 ╭─────────────────────────────────╮
 │  Built with ◆ by ThereIsSomething │
 │  GenAI · Term VIII · SST · 2026  │
 ╰─────────────────────────────────╯
```

</div>
