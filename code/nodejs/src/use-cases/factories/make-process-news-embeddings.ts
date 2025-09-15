import { S3BucketProvider } from '@/providers/bucket/s3-bucket.js'
import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { ProcessNewsEmbeddingsUseCase } from '../process-news-embeddings.js'

export function makeProcessNewsEmbeddings() {
  const aiProvider = new BedrockProvider()
  const bucketProvider = new S3BucketProvider()
  return new ProcessNewsEmbeddingsUseCase(aiProvider, bucketProvider)
}
