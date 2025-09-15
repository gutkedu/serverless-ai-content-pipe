import { S3BucketProvider } from '@/providers/bucket/s3-bucket.js'
import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { ProcessNewsEmbeddingsUseCase } from '../process-news-embeddings.js'
import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'

export function makeProcessNewsEmbeddings(pineconeApiKey: string) {
  const aiProvider = new BedrockProvider()
  const bucketProvider = new S3BucketProvider()
  const vectorRepository = new PineconeVectorRepository(
    pineconeApiKey,
    'ai-content-pipe'
  )
  return new ProcessNewsEmbeddingsUseCase(
    aiProvider,
    bucketProvider,
    vectorRepository
  )
}
