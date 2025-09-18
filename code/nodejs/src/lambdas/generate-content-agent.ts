import { getLogger } from '@/shared/logger/get-logger.js'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { makeGenerateContentForEmailUseCase } from '@/use-cases/factories/make-generate-content-for-email.js'
import { fetchPineconeApiKey } from '@/shared/parameters/fetch-pinecone-apikey.js'
import z from 'zod'

const logger = getLogger()

const schema = z.object({
  topic: z.string().min(2).max(100).default('Artificial Intelligence'),
  contentType: z
    .enum(['summary', 'newsletter', 'digest'])
    .default('newsletter'),
  recipients: z
    .array(z.string().email())
    .min(1)
    .default([process.env.DEFAULT_TO_EMAIL || 'user@example.com']),
  maxResults: z.number().min(1).max(100).default(5)
})

export const generateContentAgentHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logger.info('Phase 3 - Content generation Lambda triggered', {
    httpMethod: event.httpMethod,
    path: event.path,
    headers: event.headers
  })

  const pineconeApiKey = await fetchPineconeApiKey()

  const useCase = makeGenerateContentForEmailUseCase(pineconeApiKey)

  try {
    // Parse request body from API Gateway event
    const requestBody = event.body ? JSON.parse(event.body) : {}
    const request = schema.parse(requestBody)

    if (!request.recipients.length) {
      throw new Error('At least one recipient email is required')
    }

    logger.info('Executing content generation with agent', { request })

    const result = await useCase.execute(request)

    logger.info('Content generation completed', {
      result
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        success: true,
        data: result,
        message: 'Content generated and sent successfully'
      })
    }
  } catch (error) {
    logger.error('Error in Phase 3 content generation Lambda', { error })
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to generate and send content'
      })
    }
  }
}
