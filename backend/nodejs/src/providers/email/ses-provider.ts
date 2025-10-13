import { ses } from '@/shared/clients/ses-client.js'
import { EmailProvider } from './email-provider.js'
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses'
import { IntegrationError } from '@/shared/errors/integration-error.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import { EmailSendRequest, EmailSendResult } from './email-provider-dto.js'

const logger = getLogger()

export class SESEmailProvider implements EmailProvider {
  private readonly client: SESClient
  private readonly fromEmail: string

  constructor(fromEmail?: string) {
    this.client = ses()
    this.fromEmail =
      fromEmail || process.env.FROM_EMAIL || 'noreply@yourdomain.com'
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      const command = new SendEmailCommand({
        Destination: {
          ToAddresses: [to]
        },
        Message: {
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: body
            }
          },
          Subject: {
            Charset: 'UTF-8',
            Data: subject
          }
        },
        Source: this.fromEmail
      })

      await this.client.send(command)
      logger.info('Email sent successfully', { to, subject })
    } catch (error) {
      logger.error('Error sending email via SES', { error, to, subject })
      throw new IntegrationError('Failed to send email via SES')
    }
  }

  async sendEmailToMultiple(
    request: EmailSendRequest
  ): Promise<EmailSendResult> {
    try {
      const recipients = Array.isArray(request.to) ? request.to : [request.to]

      logger.info('Sending email to multiple recipients', {
        recipientCount: recipients.length,
        subject: request.subject,
        isHtml: request.isHtml
      })

      const command = new SendEmailCommand({
        Destination: {
          ToAddresses: recipients
        },
        Message: {
          Body: {
            ...(request.isHtml
              ? {
                  Html: {
                    Charset: 'UTF-8',
                    Data: request.body
                  }
                }
              : {
                  Text: {
                    Charset: 'UTF-8',
                    Data: request.body
                  }
                })
          },
          Subject: {
            Charset: 'UTF-8',
            Data: request.subject
          }
        },
        Source: this.fromEmail
      })

      const result = await this.client.send(command)
      const messageId = result.MessageId || 'unknown'

      logger.info('Email sent successfully to multiple recipients', {
        messageId,
        recipientCount: recipients.length,
        subject: request.subject
      })

      return {
        messageId,
        recipientCount: recipients.length
      }
    } catch (error) {
      logger.error('Error sending email to multiple recipients via SES', {
        error,
        request
      })
      throw new IntegrationError(
        'Failed to send email to multiple recipients via SES'
      )
    }
  }
}
