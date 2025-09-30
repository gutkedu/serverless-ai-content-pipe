import { getLogger } from '@/shared/logger/get-logger.js'
import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'
import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { fetchPineconeApiKey } from '@/shared/parameters/fetch-pinecone-apikey.js'
import type {
  BedrockAgentFunctionEvent,
  BedrockAgentFunctionResponse
} from '@aws-lambda-powertools/event-handler/types'
import { z } from 'zod'
import type { Context } from 'aws-lambda'

const logger = getLogger()

let pineconeRepository: PineconeVectorRepository
let bedrockProvider: BedrockProvider

async function initializeProviders() {
  if (!pineconeRepository || !bedrockProvider) {
    const pineconeApiKey = await fetchPineconeApiKey()
    const pineconeIndex = 'ai-content-pipe'
    pineconeRepository = new PineconeVectorRepository(
      pineconeApiKey,
      pineconeIndex
    )
    bedrockProvider = new BedrockProvider()
  }
}

const parametersSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  maxResults: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 5
      const num = parseInt(val, 10)
      return isNaN(num) ? 5 : Math.max(1, Math.min(num, 50))
    })
})

const eventSchema = z.object({
  actionGroup: z.string(),
  function: z.string(),
  messageVersion: z.string(),
  agent: z.object({
    name: z.string(),
    id: z.string(),
    alias: z.string(),
    version: z.string()
  }),
  parameters: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        value: z.string()
      })
    )
    .optional(),
  inputText: z.string(),
  sessionId: z.string(),
  sessionAttributes: z.record(z.string(), z.any()),
  promptSessionAttributes: z.record(z.string(), z.any())
})

export const handler = async (
  event: BedrockAgentFunctionEvent,
  context: Context
): Promise<BedrockAgentFunctionResponse> => {
  logger.addContext(context)
  logger.info('Bedrock Agent Pinecone Action called', {
    sessionId: event.sessionId,
    function: event.function,
    actionGroup: event.actionGroup
  })

  try {
    const validatedEvent = eventSchema.parse(event)

    await initializeProviders()

    const parametersMap: Record<string, string> = {}
    if (validatedEvent.parameters) {
      for (const param of validatedEvent.parameters) {
        parametersMap[param.name] = param.value
      }
    }

    const validatedParams = parametersSchema.parse(parametersMap)

    logger.info('Executing Pinecone search for Bedrock Agent', {
      query: validatedParams.query,
      maxResults: validatedParams.maxResults
    })

    const queryEmbedding = await bedrockProvider.generateBedrockEmbedding(
      validatedParams.query
    )

    const searchResults = await pineconeRepository.search({
      vector: queryEmbedding,
      topK: validatedParams.maxResults,
      includeMetadata: true
    })

    const articles = searchResults.map((result) => ({
      title: result.metadata?.title || 'No title',
      content: result.metadata?.content || 'No content',
      url: result.metadata?.url || 'No URL',
      score: result.score || 0
    }))

    logger.info('Pinecone search completed for Bedrock Agent', {
      resultsCount: articles.length
    })

    return {
      messageVersion: event.messageVersion,
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseBody: {
            TEXT: {
              body: JSON.stringify({
                articles,
                query: validatedParams.query,
                resultsCount: articles.length
              })
            }
          }
        }
      },
      sessionAttributes: event.sessionAttributes,
      promptSessionAttributes: event.promptSessionAttributes
    }
  } catch (error) {
    logger.error('Error in Bedrock Agent Pinecone action', { error })

    return {
      messageVersion: event.messageVersion,
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseState: 'FAILURE',
          responseBody: {
            TEXT: {
              body: JSON.stringify({
                error: 'Failed to search articles',
                message:
                  error instanceof Error ? error.message : 'Unknown error'
              })
            }
          }
        }
      },
      sessionAttributes: event.sessionAttributes,
      promptSessionAttributes: event.promptSessionAttributes
    }
  }
}
