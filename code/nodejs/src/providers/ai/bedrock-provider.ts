import { bedrock } from '@/shared/clients/bedrock-client.js'
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
  Tool,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock
} from '@aws-sdk/client-bedrock-runtime'
import { getLogger } from '@/shared/logger/get-logger.js'
import { IntegrationError } from '@/shared/errors/integration-error.js'
import { AIProvider, ToolExecutor } from './ai-provider.js'
import {
  TitanEmbeddingResponse,
  FunctionCallingRequest,
  FunctionCallingResult
} from './ai-provider-dtos.js'

const logger = getLogger()

export class BedrockProvider implements AIProvider {
  private readonly client: BedrockRuntimeClient
  private readonly modelId: string

  constructor() {
    this.client = bedrock()
    this.modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-v2'
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      logger.info('Invoking Bedrock model', {
        modelId: this.modelId,
        promptLength: prompt.length
      })

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
          max_tokens_to_sample: 4096,
          temperature: 0.7,
          top_k: 250,
          top_p: 0.999,
          stop_sequences: ['\n\nHuman:']
        })
      })
      const response = await this.client.send(command)

      if (!response.body) {
        throw new IntegrationError('Empty response from Bedrock', {
          service: 'bedrock',
          details: 'Response body is empty'
        })
      }

      const responseBody = JSON.parse(new TextDecoder().decode(response.body))

      if (!responseBody.completion) {
        throw new IntegrationError('Invalid response format from Bedrock', {
          service: 'bedrock',
          details: 'Response missing completion field'
        })
      }

      return responseBody.completion.trim()
    } catch (error) {
      logger.error('Error generating response from Bedrock', {
        error,
        modelId: this.modelId,
        promptLength: prompt.length
      })

      if (error instanceof IntegrationError) {
        throw error
      }

      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new IntegrationError('Failed to generate response from Bedrock', {
        service: 'bedrock',
        details: message
      })
    }
  }

  async generateBedrockEmbedding(text: string): Promise<number[]> {
    try {
      const command = new InvokeModelCommand({
        modelId: 'amazon.titan-embed-text-v1',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: text
        })
      })

      const response = await this.client.send(command)

      if (!response.body) {
        throw new Error('No response body from Bedrock')
      }

      const responseBody = JSON.parse(
        new TextDecoder().decode(response.body)
      ) as TitanEmbeddingResponse

      if (!responseBody.embedding) {
        throw new Error('No embedding in Bedrock response')
      }

      return responseBody.embedding
    } catch (error) {
      logger.error('Error generating Bedrock embedding', {
        error,
        textLength: text.length
      })
      throw new IntegrationError('Failed to generate embedding from Bedrock')
    }
  }

  async executeWithFunctionCalling(
    request: FunctionCallingRequest,
    toolExecutor: ToolExecutor
  ): Promise<FunctionCallingResult> {
    logger.info('Starting function calling execution', {
      prompt: request.prompt.substring(0, 100) + '...',
      toolsCount: request.tools.length
    })

    const toolCalls: Array<{ name: string; input: unknown; result: unknown }> =
      []
    const conversationHistory = [
      {
        role: 'user' as const,
        content: [{ text: request.prompt }]
      }
    ]

    const maxIterations = 10 // Prevent infinite loops
    let currentIteration = 0

    while (currentIteration < maxIterations) {
      currentIteration++

      logger.info(`Function calling iteration ${currentIteration}`)

      const command = new ConverseCommand({
        modelId: this.modelId,
        messages: conversationHistory,
        toolConfig: {
          tools: request.tools as Tool[]
        },
        inferenceConfig: {
          maxTokens: request.maxTokens || 4000,
          temperature: request.temperature || 0.1
        }
      })

      const response = await this.client.send(command)

      if (!response.output?.message) {
        throw new IntegrationError('No response from model', {
          service: 'bedrock',
          details: 'Empty message in response'
        })
      }

      const assistantMessage = response.output.message

      const toolUseBlocks =
        assistantMessage.content?.filter(
          (block): block is ContentBlock & ToolUseBlock => 'toolUse' in block
        ) || []

      if (toolUseBlocks.length === 0) {
        const textBlocks =
          assistantMessage.content?.filter((block) => 'text' in block) || []

        const finalResponse = textBlocks
          .map((block) => ('text' in block ? block.text : ''))
          .join('\n')

        logger.info('Function calling completed', {
          iterations: currentIteration,
          toolCallsCount: toolCalls.length
        })

        return {
          response: finalResponse,
          toolCalls
        }
      }

      const toolResults: ToolResultBlock[] = []

      for (const toolUseBlock of toolUseBlocks) {
        if (!toolUseBlock.toolUse) {
          logger.error('toolUseBlock.toolUse is undefined', { toolUseBlock })
          continue
        }
        const toolName = toolUseBlock.toolUse.name
        const toolInput = toolUseBlock.toolUse.input
        const toolUseId = toolUseBlock.toolUse.toolUseId

        if (!toolName) {
          logger.error('toolUseBlock.toolUse.name is undefined', {
            toolUseBlock
          })

          continue
        }

        logger.info('Executing tool', { toolName, toolInput })

        try {
          const result = await toolExecutor.executeTool(toolName, toolInput)

          toolCalls.push({
            name: toolName,
            input: toolInput,
            result
          })

          toolResults.push({
            content: [
              {
                text: JSON.stringify(result)
              }
            ],
            toolUseId
          })

          logger.info('Tool executed successfully', { toolName, result })
        } catch (error) {
          logger.error('Tool execution failed', { toolName, error })

          toolResults.push({
            toolUseId,
            content: [
              {
                text: `Error: ${
                  error instanceof Error ? error.message : 'Unknown error'
                }`
              }
            ],
            status: 'error'
          })
        }
      }

      conversationHistory.push({
        role: 'user',
        content: [{ text: JSON.stringify(assistantMessage) }]
      })
    }

    throw new IntegrationError(
      `Maximum iterations (${maxIterations}) reached`,
      {
        service: 'bedrock',
        details: 'Function calling exceeded iteration limit'
      }
    )
  }
}
