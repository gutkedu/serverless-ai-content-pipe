import { Handler } from 'aws-lambda'
import { makeGenerateNewsletter } from '@/use-cases/factories/make-generate-newsletter.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import { fetchPineconeApiKey } from '@/shared/parameters/fetch-pinecone-apikey.js'
import { fetchFromEmail } from '@/shared/parameters/fetch-from-email.js'
import type {
  GenerateNewsletterRequest,
  GenerateNewsletterResponse
} from '@/use-cases/generate-newsletter.js'

const logger = getLogger()

/**
 * Generate Newsletter Lambda Handler
 *
 * Uses the GenerateNewsletterUseCase to orchestrate:
 * 1. Search Pinecone for relevant articles based on topic
 * 2. Generate newsletter content using Bedrock AI
 * 3. Send formatted newsletter via SES
 *
 * Architecture: Lambda (handler) → Factory → Use Case → Providers/Repositories
 */
export const handler: Handler<
  GenerateNewsletterRequest,
  GenerateNewsletterResponse
> = async (event, context) => {
  logger.addContext(context)

  try {
    logger.info('Initializing newsletter generation', {
      topic: event.topic,
      recipientCount: event.recipients?.length
    })

    // Fetch configuration parameters
    const pineconeApiKey = await fetchPineconeApiKey()
    const fromEmail = await fetchFromEmail()
    const modelId = process.env.MODEL_ID || 'us.meta.llama3-3-70b-instruct-v1:0'

    // Create use case via factory (dependency injection)
    const generateNewsletterUseCase = makeGenerateNewsletter({
      pineconeApiKey,
      fromEmail,
      modelId
    })

    // Execute use case with event data
    const result = await generateNewsletterUseCase.execute(event)

    logger.info('Newsletter generation completed', {
      success: result.success,
      articlesFound: result.articlesFound,
      emailSent: result.emailSent
    })

    return result
  } catch (error) {
    logger.error('Fatal error in newsletter generation handler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return {
      success: false,
      message: `Fatal error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      emailSent: false
    }
  }
}
