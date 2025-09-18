import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { ToolExecutor } from '@/providers/ai/ai-provider.js'
import { EmailProvider } from '@/providers/email/email-provider.js'
import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'
import { ToolsFactory } from '@/tools/tools-factory.js'
import { PineconeSearchTool } from '@/tools/pinecone-search-tool.js'
import { EmailSendTool } from '@/tools/email-send-tool.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import { ToolName } from '@/tools/tool-dtos.js'

const logger = getLogger()

export interface ContentGenerationRequest {
  topic: string
  contentType: 'summary' | 'newsletter' | 'digest'
  recipients: string[]
  maxResults?: number
}

export interface GeneratedEmailContent {
  response: string
  toolCalls: Array<{
    name: string
    input: unknown
    result: unknown
  }>
  success: boolean
}

export class GenerateContentForEmailUseCase implements ToolExecutor {
  private readonly bedrockProvider: BedrockProvider
  private readonly toolsFactory: ToolsFactory
  private readonly tools: Map<string, PineconeSearchTool | EmailSendTool>

  constructor(
    bedrockProvider: BedrockProvider,
    emailProvider: EmailProvider,
    pineconeRepository: PineconeVectorRepository
  ) {
    this.bedrockProvider = bedrockProvider
    this.toolsFactory = new ToolsFactory({
      bedrockProvider,
      emailProvider,
      pineconeRepository
    })
    this.tools = this.toolsFactory.createAvailableTools()
  }

  async executeTool(toolName: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`)
    }

    if (toolName === ToolName.PINECONE_SEARCH) {
      return await (tool as PineconeSearchTool).execute(
        input as Parameters<PineconeSearchTool['execute']>[0]
      )
    } else if (toolName === ToolName.SEND_EMAIL) {
      return await (tool as EmailSendTool).execute(
        input as Parameters<EmailSendTool['execute']>[0]
      )
    } else {
      throw new Error(`Unsupported tool: ${toolName}`)
    }
  }

  async execute(
    request: ContentGenerationRequest
  ): Promise<GeneratedEmailContent> {
    logger.info('Starting function calling content generation for email', {
      request
    })

    try {
      const prompt = this.buildAgentPrompt(request)
      const toolDefinitions = this.toolsFactory.getToolDefinitions()

      const result = await this.bedrockProvider.executeWithFunctionCalling(
        {
          prompt,
          tools: toolDefinitions,
          maxTokens: 4000,
          temperature: 0.1
        },
        this // Pass 'this' as the ToolExecutor
      )

      logger.info('Function calling content generation completed', {
        responseLength: result.response.length,
        toolCallsCount: result.toolCalls.length
      })

      return {
        response: result.response,
        toolCalls: result.toolCalls,
        success: true
      }
    } catch (error) {
      logger.error('Error in function calling content generation', {
        error,
        request
      })
      return {
        response: `Failed to generate content: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        toolCalls: [],
        success: false
      }
    }
  }

  private buildAgentPrompt(request: ContentGenerationRequest): string {
    const maxResults = request.maxResults || 5

    return `You are a professional content editor. Your task is to create and send a ${
      request.contentType
    } about "${request.topic}".

Please follow these steps:

1. First, use the pinecone_search tool to find relevant content about "${
      request.topic
    }". Search for up to ${maxResults} results.

2. Based on the search results, create a compelling ${request.contentType} that:
   - Synthesizes the most important information from the sources
   - Is well-structured and engaging for email readers
   - Uses proper HTML formatting for better presentation
   - Includes a clear and descriptive subject line
   - References the sources naturally in the content

3. Finally, use the send_email tool to send the generated content to these recipients: ${request.recipients.join(
      ', '
    )}

Requirements:
- Content Type: ${request.contentType}
- Topic: ${request.topic}
- Recipients: ${request.recipients.join(', ')}
- Use HTML format for the email content
- Create an engaging subject line that reflects the ${
      request.contentType
    } about ${request.topic}

Please execute these steps and confirm when the email has been sent successfully.`
  }
}
