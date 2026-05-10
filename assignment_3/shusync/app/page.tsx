'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = { role: 'user' | 'assistant'; content: string };
type PipelineStep = { label: string; status: 'idle' | 'active' | 'done' };

const PIPELINE_STEPS: PipelineStep[] = [
  { label: 'Parse PDF', status: 'idle' },
  { label: 'Chunk Text', status: 'idle' },
  { label: 'Embed Vectors', status: 'idle' },
  { label: 'Index to DB', status: 'idle' },
];

const SUGGESTED_QUESTIONS = [
  'Summarize this document',
  'What are the key topics covered?',
  'List the main takeaways',
  'Explain the most important concepts',
];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-[var(--text-muted)]',
    active: 'bg-[var(--amber)] animate-pulse',
    done: 'bg-[var(--green)]',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[#8b5cf6] flex items-center justify-center shadow-md shadow-[var(--accent-glow)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <circle cx="5" cy="6" r="1.5"/><circle cx="19" cy="6" r="1.5"/>
          <circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="18" r="1.5"/>
          <line x1="9.5" y1="10" x2="6" y2="7"/><line x1="14.5" y1="10" x2="18" y2="7"/>
          <line x1="9.5" y1="14" x2="6" y2="17"/><line x1="14.5" y1="14" x2="18" y2="17"/>
        </svg>
      </div>
      <div>
        <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
          En<span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-[#8b5cf6]">gram</span>
        </span>
        {!compact && <p className="text-[9px] text-[var(--text-muted)] -mt-0.5 tracking-wider uppercase">Document Intelligence</p>}
      </div>
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [chunkCount, setChunkCount] = useState(0);
  const [pipeline, setPipeline] = useState<PipelineStep[]>(PIPELINE_STEPS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const resetSession = () => {
    setFile(null);
    setUploadStatus('idle');
    setChunkCount(0);
    setPipeline(PIPELINE_STEPS);
    setMessages([]);
    setInput('');
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const askSuggested = (q: string) => {
    setInput(q);
    // auto-submit
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setIsGenerating(true);
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...messages, { role: 'user', content: q }] }),
    }).then(async res => {
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setMessages(prev => {
          const n = [...prev];
          n[n.length - 1] = { role: 'assistant', content: text };
          return n;
        });
      }
    }).catch(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong.' }]);
    }).finally(() => {
      setIsGenerating(false);
      setInput('');
    });
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const advancePipeline = (step: number) => {
    setPipeline(prev => prev.map((s, i) => ({
      ...s,
      status: i < step ? 'done' : i === step ? 'active' : 'idle',
    })));
  };

  const handleUpload = useCallback(async (f: File) => {
    setFile(f);
    setUploadStatus('uploading');
    advancePipeline(0);

    const fd = new FormData();
    fd.append('file', f);

    // Simulate pipeline progression
    const timers = [
      setTimeout(() => advancePipeline(1), 1500),
      setTimeout(() => advancePipeline(2), 3500),
      setTimeout(() => advancePipeline(3), 5500),
    ];

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setChunkCount(data.chunks || 0);
      setPipeline(prev => prev.map(s => ({ ...s, status: 'done' as const })));
      setUploadStatus('success');
      setMessages([{
        role: 'assistant',
        content: `I've processed **${f.name}** into ${data.chunks || 'several'} searchable chunks. Ask me anything about it.`,
      }]);
    } catch {
      setUploadStatus('error');
    } finally {
      timers.forEach(clearTimeout);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    onDrop: (files) => files[0] && handleUpload(files[0]),
  });

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    const q = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: q }] }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setMessages(prev => {
          const n = [...prev];
          n[n.length - 1] = { role: 'assistant', content: text };
          return n;
        });
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  // ──────────── RENDER ────────────
  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-72 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <Logo />
        </div>

        {/* Sources Section */}
        <div className="px-4 pt-5 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">Sources</p>
        </div>

        {uploadStatus === 'success' && file ? (
          <div className="px-3 animate-fade-in">
            <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)]">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{file.name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
              {/* Metadata */}
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded-lg bg-[var(--bg-primary)]">
                  <p className="text-lg font-semibold text-[var(--accent)]">{chunkCount}</p>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Chunks</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-[var(--bg-primary)]">
                  <p className="text-lg font-semibold text-[var(--green)]">1024</p>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Dim</p>
                </div>
              </div>
              {/* Upload New button */}
              <button onClick={resetSession} className="mt-3 w-full py-2 rounded-lg border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors">
                ↻ Upload New Document
              </button>
              {/* Chat stats */}
              <div className="mt-2 text-center text-[10px] text-[var(--text-muted)]">
                {messages.filter(m => m.role === 'user').length} queries · {messages.filter(m => m.role === 'assistant').length} responses
              </div>
            </div>
          </div>
        ) : uploadStatus === 'uploading' ? (
          <div className="px-3">
            <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)]">
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-3">Processing...</p>
              <div className="space-y-2">
                {pipeline.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <StatusDot status={s.status} />
                    <span className={s.status === 'done' ? 'text-[var(--text-secondary)]' : s.status === 'active' ? 'text-[var(--amber)]' : 'text-[var(--text-muted)]'}>
                      {s.label}
                    </span>
                    {s.status === 'done' && <span className="ml-auto text-[var(--green)] text-[10px]">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Pipeline Info */}
        <div className="mt-auto px-4 py-4 border-t border-[var(--border-subtle)]">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">Pipeline</p>
          <div className="space-y-1.5 text-[11px] text-[var(--text-muted)]">
            <div className="flex justify-between"><span>Embeddings</span><span className="font-mono text-[var(--text-secondary)]">nv-embedqa-e5-v5</span></div>
            <div className="flex justify-between"><span>LLM</span><span className="font-mono text-[var(--text-secondary)]">llama-3.3-70b</span></div>
            <div className="flex justify-between"><span>Vector DB</span><span className="font-mono text-[var(--text-secondary)]">Pinecone</span></div>
            <div className="flex justify-between"><span>Retrieval</span><span className="font-mono text-[var(--text-secondary)]">Top-5 cosine</span></div>
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]">
        {/* Top Bar */}
        <div className="h-12 border-b border-[var(--border)] flex items-center px-5 flex-shrink-0">
          <p className="text-sm text-[var(--text-secondary)]">
            {uploadStatus === 'success' ? (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
                Document loaded — {chunkCount} chunks indexed
              </span>
            ) : uploadStatus === 'uploading' ? (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)] animate-pulse" />
                Processing document...
              </span>
            ) : (
              'Upload a document to begin'
            )}
          </p>
        </div>

        {/* Content */}
        {uploadStatus !== 'success' ? (
          /* ── UPLOAD VIEW ── */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-lg">
              <div className="text-center mb-8">
                {/* Branded hero */}
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#8b5cf6] flex items-center justify-center shadow-lg shadow-[var(--accent-glow-strong)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <circle cx="5" cy="6" r="1.5"/><circle cx="19" cy="6" r="1.5"/>
                    <circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="18" r="1.5"/>
                    <line x1="9.5" y1="10" x2="6" y2="7"/><line x1="14.5" y1="10" x2="18" y2="7"/>
                    <line x1="9.5" y1="14" x2="6" y2="17"/><line x1="14.5" y1="14" x2="18" y2="17"/>
                  </svg>
                </div>
                <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
                  En<span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-[#8b5cf6]">gram</span>
                </h1>
                <p className="text-sm text-[var(--text-muted)] max-w-xs mx-auto">
                  Upload a document. Ask questions. Get answers grounded in your content — not hallucinations.
                </p>
              </div>
              <div
                {...getRootProps()}
                className={`relative p-10 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 text-center
                  ${isDragActive
                    ? 'border-[var(--accent)] bg-[var(--accent-glow)]'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                  }`}
              >
                <input {...getInputProps()} />
                <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center">
                  {uploadStatus === 'uploading' ? (
                    <svg className="spinner w-6 h-6 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  )}
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {uploadStatus === 'uploading' ? 'Processing...' : 'Drop PDF here or click to browse'}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {uploadStatus === 'uploading' ? 'Parsing → Chunking → Embedding → Indexing' : 'Supports .pdf files'}
                </p>
              </div>
              {uploadStatus === 'error' && (
                <p className="mt-3 text-sm text-[var(--red)] text-center">Failed to process. Check your API keys and try again.</p>
              )}
              {/* Architecture diagram */}
              <div className="mt-8 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3 font-semibold">RAG Pipeline Architecture</p>
                <div className="flex items-center flex-wrap gap-1 text-xs text-[var(--text-secondary)]">
                  {['Parse', 'Chunk', 'Embed', 'Store', 'Retrieve', 'Generate'].map((step, i, arr) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="w-5 h-5 rounded bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center text-[9px] font-mono text-[var(--accent)] flex-shrink-0">{i + 1}</div>
                      <span className="text-[11px] whitespace-nowrap">{step}</span>
                      {i < arr.length - 1 && <span className="text-[var(--text-muted)] mx-0.5">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── CHAT VIEW ── */
          <>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-3xl mx-auto space-y-5">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center flex-shrink-0 mr-3 mt-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                    )}
                    <div className={`relative group max-w-[75%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[var(--accent)] text-white rounded-br-md'
                        : 'bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-md'
                    }`}>
                      {msg.role === 'assistant' && msg.content && (
                        <button
                          onClick={() => copyToClipboard(msg.content, i)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--accent)]"
                          title="Copy to clipboard"
                        >
                          {copiedIdx === i ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          )}
                        </button>
                      )}
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-[var(--text-primary)] prose-strong:text-[var(--text-primary)] prose-code:text-[var(--accent)] prose-code:bg-[var(--bg-primary)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-ul:my-1.5 prose-ol:my-1.5">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                    </div>
                  </div>
                ))}
                {isGenerating && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex items-center gap-3 animate-fade-in">
                    <div className="w-7 h-7 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center flex-shrink-0">
                      <svg className="spinner w-3.5 h-3.5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                    </div>
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" style={{ animation: `pulse-dot 1s ease-in-out ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Suggested Questions */}
                {messages.length <= 1 && !isGenerating && (
                  <div className="animate-fade-in">
                    <p className="text-xs text-[var(--text-muted)] mb-2">Suggested questions</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => askSuggested(q)}
                          className="px-3 py-1.5 rounded-full border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              <form onSubmit={sendMessage} className="max-w-3xl mx-auto relative">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about your document..."
                  disabled={isGenerating}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl pl-4 pr-12 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isGenerating}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] flex items-center justify-center transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </form>
              <p className="text-center text-[10px] text-[var(--text-muted)] mt-2">
                Engram retrieves top-5 chunks via cosine similarity, then generates a grounded response using LLaMA 3.3 70B.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
