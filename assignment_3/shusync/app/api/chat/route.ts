import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

    // 1. Embed the user query using Nvidia NIM (input_type: 'query' for asymmetric retrieval)
    const embeddingRes = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        input: [latestMessage],
        model: 'nvidia/nv-embedqa-e5-v5',
        input_type: 'query',
        encoding_format: 'float',
        truncate: 'END',
      }),
    });

    if (!embeddingRes.ok) {
      const errText = await embeddingRes.text();
      console.error('Embedding error:', errText);
      throw new Error(`Embedding API error: ${errText}`);
    }

    const embeddingData = await embeddingRes.json();
    const queryVector = embeddingData.data[0].embedding;

    // 2. Query Pinecone directly for top 5 relevant chunks
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = pc.index(process.env.PINECONE_INDEX!);

    const queryResponse = await pineconeIndex.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
    });

    // 3. Format context from retrieved chunks
    const chunks = queryResponse.matches || [];
    console.log(`Retrieved ${chunks.length} chunks from Pinecone`);

    if (chunks.length === 0) {
      console.warn('No chunks found in Pinecone! The document may not have been indexed correctly.');
    }

    const context = chunks
      .map((match, i) => {
        const text = (match.metadata as any)?.pageContent || (match.metadata as any)?.text || '';
        const page = (match.metadata as any)?.['loc.pageNumber'] || (match.metadata as any)?.page || 'N/A';
        const source = (match.metadata as any)?.source || 'unknown';
        console.log(`  Chunk ${i + 1} (score: ${match.score?.toFixed(3)}, page: ${page}): ${text.substring(0, 100)}...`);
        return `[Source: ${source}, Page: ${page}]\n${text}`;
      })
      .join('\n\n---\n\n');

    // 4. Generate response using Nvidia NIM LLM with streaming
    const chatRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [
          {
            role: 'system',
            content: `You are Engram, an intelligent AI assistant that helps users deeply understand uploaded documents.

Your behavior rules:
1. **Factual questions**: Answer directly using the document context. Cite specific sections, page numbers, or quotes when possible.
2. **Advisory/opinion questions** (e.g. "how should I approach this?", "what do you think?"): You MAY provide helpful guidance, suggestions, and reasoning — but ONLY if grounded in the document's content. Explain your reasoning by referencing what the document says.
3. **Summarization**: When asked to summarize, provide a comprehensive summary covering all major points from the context.
4. **Out-of-scope questions**: If the question is completely unrelated to the document, say "This doesn't appear to be covered in the uploaded document."
5. **Never hallucinate**: Do not invent facts. If unsure, say so honestly.

Be thorough, well-structured (use bullet points and headers when helpful), and conversational.

Context from the document:
${context}`,
          },
          {
            role: 'user',
            content: latestMessage,
          },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error('Chat LLM error:', errText);
      throw new Error(`Chat API error: ${errText}`);
    }

    // 5. Stream SSE response back to the client
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = chatRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(new TextEncoder().encode(content));
                }
              } catch {
                // skip malformed JSON chunks
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
