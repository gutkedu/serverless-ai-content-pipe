import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { SESEmailProvider } from '@/providers/email/ses-provider.js'
import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'
import { GenerateNewsletterUseCase } from '../generate-newsletter.js'

export function makeGenerateNewsletter(params: {
  pineconeApiKey: string
  fromEmail: string
  modelId?: string
}) {
  const aiProvider = new BedrockProvider(
    params.modelId || 'us.meta.llama3-3-70b-instruct-v1:0'
  )
  const emailProvider = new SESEmailProvider(params.fromEmail)
  const vectorRepository = new PineconeVectorRepository(
    params.pineconeApiKey,
    'ai-content-pipe'
  )

  return new GenerateNewsletterUseCase(
    aiProvider,
    emailProvider,
    vectorRepository
  )
}
