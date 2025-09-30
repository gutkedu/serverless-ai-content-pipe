import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'
import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import {
  ToolDefinition,
  PineconeSearchToolInput,
  PineconeSearchToolResult,
  ToolName
} from './tool-dtos.js'

const logger = getLogger()

export class PineconeSearchTool {
  constructor(
    private readonly pineconeRepository: PineconeVectorRepository,
    private readonly bedrockProvider: BedrockProvider
  ) {}

  async execute(
    input: PineconeSearchToolInput
  ): Promise<PineconeSearchToolResult[]> {
    logger.info('Executing Pinecone search tool', { input })

    try {
      // Generate embedding for the search query
      const queryEmbedding =
        await this.bedrockProvider.generateBedrockEmbedding(input.query)

      // Search Pinecone
      const searchResults = await this.pineconeRepository.search({
        vector: queryEmbedding,
        topK: input.maxResults ?? 5,
        includeMetadata: true
      })

      const results = searchResults.map((result) => ({
        title: (result.metadata?.title as string) ?? '',
        content: (result.metadata?.content as string) ?? '',
        url: (result.metadata?.url as string) ?? '',
        score: result.score
      }))

      logger.info('Pinecone search completed', {
        query: input.query,
        resultsCount: results.length
      })

      return results
    } catch (error) {
      logger.error('Error in Pinecone search tool', { error, input })
      throw error
    }
  }

  // Tool definition for Bedrock function calling
  static getToolDefinition(): ToolDefinition {
    return {
      toolSpec: {
        name: ToolName.PINECONE_SEARCH,
        description:
          'Search for relevant content in the knowledge base using semantic similarity. Use this to find news articles, blog posts, or other content related to a specific topic.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'The search query to find relevant content. Be specific about the topic you want to search for.'
              },
              maxResults: {
                type: 'number',
                description:
                  'Maximum number of results to return (default: 5, max: 20)',
                minimum: 1,
                maximum: 20
              }
            },
            required: ['query']
          }
        }
      }
    }
  }
}
