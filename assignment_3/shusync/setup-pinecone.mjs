import { Pinecone } from '@pinecone-database/pinecone';

async function setup() {
  try {
    console.log('Initializing Pinecone client...');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    
    const indexName = process.env.PINECONE_INDEX || 'notebooklm';
    
    console.log(`Checking if index "${indexName}" exists...`);
    const existingIndexes = await pc.listIndexes();
    const indexExists = existingIndexes.indexes?.some(idx => idx.name === indexName);
    
    if (indexExists) {
      console.log(`Index "${indexName}" already exists. No action needed.`);
    } else {
      console.log(`Creating index "${indexName}" with dimension 1024...`);
      await pc.createIndex({
        name: indexName,
        dimension: 1024,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      console.log('Index created successfully! It might take a minute or two to initialize fully.');
    }
  } catch (error) {
    console.error('Error configuring Pinecone:', error);
  }
}

setup();
