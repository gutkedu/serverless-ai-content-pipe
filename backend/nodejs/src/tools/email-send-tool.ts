import { EmailProvider } from '@/providers/email/email-provider.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import {
  ToolDefinition,
  EmailSendToolInput,
  EmailSendToolResult,
  ToolName
} from './tool-dtos.js'

const logger = getLogger()

export class EmailSendTool {
  constructor(private readonly emailProvider: EmailProvider) {}

  async execute(input: EmailSendToolInput): Promise<EmailSendToolResult> {
    logger.info('Executing email send tool', {
      to: input.to,
      subject: input.subject,
      contentType: input.contentType
    })

    try {
      // Use the new sendEmailToMultiple method for better performance
      const result = await this.emailProvider.sendEmailToMultiple({
        to: input.to,
        subject: input.subject,
        body: input.content,
        isHtml: input.contentType === 'html'
      })

      logger.info('Email sent successfully via tool', {
        messageId: result.messageId,
        subject: input.subject,
        recipients: result.recipientCount
      })

      return {
        messageId: result.messageId,
        status: 'sent',
        recipients: result.recipientCount
      }
    } catch (error) {
      logger.error('Error in email send tool', { error, input })
      throw error
    }
  }

  // Tool definition for Bedrock function calling
  static getToolDefinition(): ToolDefinition {
    return {
      toolSpec: {
        name: ToolName.SEND_EMAIL,
        description:
          'Send an email with the generated content to specified recipients. Use this after generating content to deliver it via email.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              to: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Array of email addresses to send to. Each must be a valid email address.'
              },
              subject: {
                type: 'string',
                description:
                  'Email subject line. Should be engaging and descriptive of the content.'
              },
              content: {
                type: 'string',
                description:
                  'Email content body. Should be well-formatted HTML or plain text.'
              },
              contentType: {
                type: 'string',
                enum: ['html', 'text'],
                description:
                  'Content type: "html" for HTML formatted emails, "text" for plain text'
              }
            },
            required: ['to', 'subject', 'content', 'contentType']
          }
        }
      }
    }
  }
}
