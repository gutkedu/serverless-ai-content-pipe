import { EmailSendRequest, EmailSendResult } from './email-provider-dto.js'

export interface EmailProvider {
  sendEmail(to: string, subject: string, body: string): Promise<void>
  sendEmailToMultiple(request: EmailSendRequest): Promise<EmailSendResult>
}
