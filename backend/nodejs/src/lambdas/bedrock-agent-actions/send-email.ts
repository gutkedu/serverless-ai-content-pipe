import { getLogger } from '@/shared/logger/get-logger.js'
import { SESEmailProvider } from '@/providers/email/ses-provider.js'
import type {
  BedrockAgentFunctionEvent,
  BedrockAgentFunctionResponse
} from '@aws-lambda-powertools/event-handler/types'
import { z } from 'zod'
import type { Context } from 'aws-lambda'

const logger = getLogger()

let emailProvider: SESEmailProvider

async function initializeProvider() {
  if (!emailProvider) {
    emailProvider = new SESEmailProvider()
  }
}

const parametersSchema = z.object({
  recipients: z.string().transform((val) => {
    try {
      const parsed = JSON.parse(val)
      return z.array(z.string().email()).parse(parsed)
    } catch {
      return [z.string().email().parse(val)]
    }
  }),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Email body is required')
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
  logger.info('Bedrock Agent Email Action called', {
    sessionId: event.sessionId,
    function: event.function,
    actionGroup: event.actionGroup
  })

  try {
    const validatedEvent = eventSchema.parse(event)

    await initializeProvider()

    // Extract and validate parameters
    const parametersMap: Record<string, string> = {}
    if (validatedEvent.parameters) {
      for (const param of validatedEvent.parameters) {
        parametersMap[param.name] = param.value
      }
    }

    const validatedParams = parametersSchema.parse(parametersMap)

    logger.info('Sending email for Bedrock Agent', {
      recipients: validatedParams.recipients.length,
      subject: validatedParams.subject.substring(0, 50) + '...'
    })

    const results = []
    for (const recipient of validatedParams.recipients) {
      await emailProvider.sendEmail(
        recipient,
        validatedParams.subject,
        validatedParams.body
      )
      results.push({ recipient, status: 'sent' })
    }

    logger.info('Email sent successfully for Bedrock Agent', {
      recipients: validatedParams.recipients.length
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
                success: true,
                results,
                recipients: validatedParams.recipients,
                subject: validatedParams.subject
              })
            }
          }
        }
      },
      sessionAttributes: event.sessionAttributes,
      promptSessionAttributes: event.promptSessionAttributes
    }
  } catch (error) {
    logger.error('Error in Bedrock Agent Email action', { error })

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
                error: 'Failed to send email',
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
