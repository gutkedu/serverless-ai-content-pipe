import { GenerateContentForEmailUseCase } from '../generate-content-for-email.js'
import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'
import { SESEmailProvider } from '@/providers/email/ses-provider.js'
import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'

export function makeGenerateContentForEmailUseCase(pineconeApiKey: string) {
  const bedrockProvider = new BedrockProvider()
  const emailProvider = new SESEmailProvider()
  const pineconeRepository = new PineconeVectorRepository(
    pineconeApiKey,
    'ai-content-pipe'
  )
  return new GenerateContentForEmailUseCase(
    bedrockProvider,
    emailProvider,
    pineconeRepository
  )
}
