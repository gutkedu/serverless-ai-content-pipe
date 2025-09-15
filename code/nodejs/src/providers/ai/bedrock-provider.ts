import { bedrock } from '@/shared/clients/bedrock-client.js'
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime'
import { getLogger } from '@/shared/logger/get-logger.js'
import { IntegrationError } from '@/shared/errors/integration-error.js'
import { AIProvider } from './ai-provider.js'
import { TitanEmbeddingResponse } from './ai-provider-dtos.js'

const logger = getLogger()

export class BedrockProvider implements AIProvider {
  private readonly client: BedrockRuntimeClient
  private readonly model: string

  constructor() {
    this.client = bedrock()
    this.model = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-v2'
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      logger.info('Invoking Bedrock model', {
        modelId: this.model,
        promptLength: prompt.length
      })

      const command = new InvokeModelCommand({
        modelId: this.model,
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
        modelId: this.model,
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
}
