import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import mammoth from 'mammoth';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const buffer = await file.arrayBuffer();
    let rawText = '';

    // Parse based on file type
    if (ext === 'pdf') {
      const blob = new Blob([buffer], { type: file.type });
      const loader = new PDFLoader(blob);
      const pdfDocs = await loader.load();
      rawText = pdfDocs.map(d => d.pageContent).join('\n\n');
    } else if (ext === 'txt' || ext === 'csv') {
      rawText = new TextDecoder('utf-8').decode(buffer);
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      rawText = result.value;
    } else {
      return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 });
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 400 });
    }

    // Wrap in LangChain Document
    const docs = [new Document({ pageContent: rawText, metadata: { source: file.name } })];

    // Chunking
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const splitDocs = await splitter.splitDocuments(docs);

    // Custom Nvidia NIM Embeddings to support input_type
    const embeddings = {
      embedDocuments: async (texts: string[]) => {
        const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
          },
          body: JSON.stringify({
            input: texts,
            model: 'nvidia/nv-embedqa-e5-v5',
            input_type: 'passage',
            encoding_format: 'float',
            truncate: 'END',
          }),
        });
        if (!res.ok) throw new Error(`Nvidia API error: ${await res.text()}`);
        const data = await res.json();
        return data.data.map((d: any) => d.embedding);
      },
      embedQuery: async (text: string) => {
        const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
          },
          body: JSON.stringify({
            input: [text],
            model: 'nvidia/nv-embedqa-e5-v5',
            input_type: 'passage',
            encoding_format: 'float',
            truncate: 'END',
          }),
        });
        if (!res.ok) throw new Error(`Nvidia API error: ${await res.text()}`);
        const data = await res.json();
        return data.data[0].embedding;
      }
    };

    // Initialize Pinecone
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = pc.index(process.env.PINECONE_INDEX!);

    // Clear old vectors so only the current document is searchable
    console.log('Clearing old vectors from Pinecone...');
    await pineconeIndex.deleteAll();
    console.log('Old vectors cleared.');

    // Store new document in Pinecone
    await PineconeStore.fromDocuments(splitDocs, embeddings, {
      pineconeIndex,
      maxConcurrency: 5, 
    });

    return NextResponse.json({ message: 'Document successfully ingested', chunks: splitDocs.length });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
