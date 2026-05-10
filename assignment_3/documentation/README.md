# Assignment 3: ShuSync

**Date:** May 10, 2026  
**Context:** Full-stack RAG pipeline built with Next.js, Pinecone, and Nvidia NIM.

## Features
- **Upload Document:** Users can upload a PDF file.
- **RAG Pipeline:** The PDF is chunked using LangChain, embedded using `nvidia/nv-embedqa-e5-v5`, and indexed into Pinecone vector DB.
- **Chat:** Users can chat with the document. Responses are generated using `meta/llama-3.3-70b-instruct` via Nvidia NIM.
- **Streaming:** Serverless streaming architecture using Vercel AI SDK principles.

## Setup Instructions

### Environment Variables
Create a `.env.local` file with:
```
PINECONE_API_KEY=your_pinecone_key
NVIDIA_API_KEY=your_nvidia_nim_key
PINECONE_INDEX=notebooklm
```

### Installation
```bash
npm install
npm run dev
```

## Architecture
- **Frontend:** Next.js App Router, Tailwind CSS, Lucide Icons, React Dropzone.
- **Backend:** Next.js Route Handlers (`/api/upload` and `/api/chat`).
- **Vector Store:** Pinecone.
- **Models:** Nvidia NIM APIs (`nv-embedqa-e5-v5` for embeddings, `llama-3.3-70b-instruct` for generation).
