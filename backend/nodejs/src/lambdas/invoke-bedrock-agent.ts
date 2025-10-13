import { getLogger } from '@/shared/logger/get-logger.js'
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand
} from '@aws-sdk/client-bedrock-agent-runtime'
import type { Context } from 'aws-lambda'
import { z } from 'zod'

const logger = getLogger()

/**
 * AWS Strands Pattern: Agent Invocation Lambda
 *
 * This Lambda provides a simple HTTP interface to invoke the Bedrock Agent.
 * It handles streaming responses and session management.
 */

const requestSchema = z.object({
  topic: z.string().min(2).max(200).describe('Topic to generate content about'),
  recipients: z
    .array(z.string().email())
    .min(1)
    .max(10)
    .optional()
    .describe('Email recipients'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Max search results'),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID for conversation continuity')
})

type InvokeAgentRequest = z.infer<typeof requestSchema>

interface InvokeAgentResponse {
  success: boolean
  response: string
  sessionId: string
  citations?: unknown[]
  trace?: unknown[]
  error?: string
}

const bedrockAgentClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1'
})

const AGENT_ID = process.env.AGENT_ID!
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID!

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Build the agent prompt from user request
 */
function buildAgentPrompt(request: InvokeAgentRequest): string {
  const recipients =
    request.recipients && request.recipients.length > 0
      ? request.recipients
      : [process.env.DEFAULT_TO_EMAIL || 'user@example.com']

  return `Generate and send a newsletter about "${request.topic}".

Steps:
1. Search for ${request.maxResults} relevant articles about "${
    request.topic
  }" using pinecone_search
2. Create an engaging HTML newsletter with:
   - Compelling subject line
   - Brief introduction
   - Summary of top articles with sources
   - Call to action
3. Send the newsletter to: ${recipients.join(', ')} using send_email

Begin by searching for articles.`
}

/**
 * Process the streaming response from Bedrock Agent
 */
async function processAgentStream(
  command: InvokeAgentCommand
): Promise<InvokeAgentResponse> {
  let fullResponse = ''
  const citations: unknown[] = []
  const trace: unknown[] = []

  try {
    const response = await bedrockAgentClient.send(command)

    if (!response.completion) {
      throw new Error('No completion stream received from agent')
    }

    for await (const event of response.completion) {
      // Handle text chunks
      if (event.chunk?.bytes) {
        const chunk = new TextDecoder().decode(event.chunk.bytes)
        fullResponse += chunk
        logger.debug('Received chunk', { chunkLength: chunk.length })
      }

      // Handle citations
      if (event.chunk?.attribution?.citations) {
        citations.push(...event.chunk.attribution.citations)
      }

      // Handle trace information (tool calls, reasoning, etc.)
      if (event.trace) {
        trace.push(event.trace)

        // Log tool invocations for observability
        if (event.trace.trace?.orchestrationTrace) {
          const orchestrationTrace = event.trace.trace.orchestrationTrace

          if (orchestrationTrace.invocationInput) {
            logger.info('Agent tool invocation', {
              tool: orchestrationTrace.invocationInput.invocationType,
              actionGroup:
                orchestrationTrace.invocationInput.actionGroupInvocationInput
                  ?.actionGroupName
            })
          }

          if (orchestrationTrace.observation) {
            logger.info('Agent tool result', {
              actionGroup:
                orchestrationTrace.observation.actionGroupInvocationOutput?.text
            })
          }

          if (orchestrationTrace.rationale) {
            logger.debug('Agent reasoning', {
              rationale: orchestrationTrace.rationale.text
            })
          }
        }
      }

      // Handle errors
      if (event.internalServerException) {
        logger.error('Agent internal error', {
          error: event.internalServerException
        })
        throw new Error(
          `Agent internal error: ${event.internalServerException.message}`
        )
      }

      if (event.validationException) {
        logger.error('Agent validation error', {
          error: event.validationException
        })
        throw new Error(
          `Agent validation error: ${event.validationException.message}`
        )
      }

      if (event.throttlingException) {
        logger.warn('Agent throttling', { error: event.throttlingException })
        throw new Error('Agent request throttled. Please try again.')
      }
    }

    return {
      success: true,
      response: fullResponse.trim(),
      sessionId: command.input.sessionId!,
      citations: citations.length > 0 ? citations : undefined,
      trace: trace.length > 0 ? trace : undefined
    }
  } catch (error) {
    logger.error('Error processing agent stream', { error })
    throw error
  }
}

/**
 * Lambda handler - Simplified for direct invocation
 */
export async function invokeAgentHandler(
  event: InvokeAgentRequest,
  context: Context
): Promise<InvokeAgentResponse> {
  logger.addContext(context)

  try {
    // Validate environment variables
    if (!AGENT_ID || !AGENT_ALIAS_ID) {
      throw new Error('AGENT_ID and AGENT_ALIAS_ID must be configured')
    }

    // Validate request directly from event
    const request = requestSchema.parse(event)

    const sessionId = request.sessionId || generateSessionId()
    const prompt = buildAgentPrompt(request)

    logger.info('Invoking Bedrock Agent', {
      agentId: AGENT_ID,
      sessionId,
      topic: request.topic
    })

    // Invoke the agent
    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId,
      inputText: prompt,
      enableTrace: true // Enable detailed tracing for observability
    })

    const result = await processAgentStream(command)

    logger.info('Agent invocation completed', {
      sessionId: result.sessionId,
      responseLength: result.response.length,
      hasCitations: !!result.citations,
      hasTrace: !!result.trace
    })

    return result
  } catch (error) {
    logger.error('Error invoking Bedrock Agent', { error })

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'

    return {
      success: false,
      response: '',
      sessionId: '',
      error: errorMessage
    }
  }
}
