import { ses } from '@/shared/clients/ses-client.js'
import { EmailProvider } from './email-provider.js'
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses'
import { IntegrationError } from '@/shared/errors/integration-error.js'
import { getLogger } from '@/shared/logger/get-logger.js'

const logger = getLogger()

export class SESEmailProvider implements EmailProvider {
  private readonly client: SESClient

  constructor() {
    this.client = ses()
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
        Source: '<your-email@example.com>'
      })

      await this.client.send(command)
    } catch (error) {
      logger.error('Error sending email via SES', { error })
      throw new IntegrationError('Failed to send email via SES')
    }
  }
}
