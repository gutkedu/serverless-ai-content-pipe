import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentResponse
} from '@aws-sdk/client-bedrock-agent-runtime'
import { getLogger } from '@/shared/logger/get-logger.js'
import { bedrockAgent } from '@/shared/clients/bedrock-agent.js'
import { AgentInvocationRequest, AgentInvocationResult } from './agent-dto.js'

const logger = getLogger()

export class BedrockAgentProvider {
  private readonly client: BedrockAgentRuntimeClient

  constructor() {
    this.client = bedrockAgent()
  }

  async invokeAgent(
    request: AgentInvocationRequest
  ): Promise<AgentInvocationResult> {
    logger.info('Invoking Bedrock Agent', {
      agentId: request.agentId,
      sessionId: request.sessionId,
      inputLength: request.inputText.length
    })

    try {
      const command = new InvokeAgentCommand({
        agentId: request.agentId,
        agentAliasId: request.agentAliasId,
        sessionId: request.sessionId,
        inputText: request.inputText,
        enableTrace: request.enableTrace || false
      })

      const response = await this.client.send(command)

      const result = await this.processStreamingResponse(response)

      logger.info('Bedrock Agent invocation completed', {
        sessionId: request.sessionId,
        responseLength: result.response.length
      })

      return result
    } catch (error) {
      logger.error('Error invoking Bedrock Agent', { error, request })
      throw error
    }
  }

  private async processStreamingResponse(
    response: InvokeAgentResponse
  ): Promise<AgentInvocationResult> {
    let fullResponse = ''
    const citations: unknown[] = []
    const trace: unknown[] = []

    if (response.completion) {
      for await (const event of response.completion) {
        // Handle text chunks
        if (event.chunk?.bytes) {
          const chunk = new TextDecoder().decode(event.chunk.bytes)
          fullResponse += chunk
        }

        // Handle citations
        if (event.chunk?.attribution?.citations) {
          citations.push(...event.chunk.attribution.citations)
        }

        // Handle trace information
        if (event.trace) {
          trace.push(event.trace)

          // Log tool usage for debugging
          if (event.trace.trace?.orchestrationTrace) {
            const orchestrationTrace = event.trace.trace.orchestrationTrace

            if (orchestrationTrace.invocationInput) {
              logger.info('Agent tool invocation', {
                tool: orchestrationTrace.invocationInput.invocationType,
                input:
                  orchestrationTrace.invocationInput.actionGroupInvocationInput
              })
            }

            if (orchestrationTrace.observation) {
              logger.info('Agent tool result', {
                result:
                  orchestrationTrace.observation.actionGroupInvocationOutput
              })
            }
          }
        }

        // Handle errors
        if (event.internalServerException || event.validationException) {
          const error =
            event.internalServerException || event.validationException
          logger.error('Agent streaming error', { error })
          throw new Error(`Agent error: ${error.message}`)
        }
      }
    }

    return {
      response: fullResponse.trim(),
      citations: citations.length > 0 ? citations : undefined,
      trace: trace.length > 0 ? trace : undefined
    }
  }

  generateSessionId(): string {
    return `session-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}`
  }
}
