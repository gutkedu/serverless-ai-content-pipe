export interface EmailSendRequest {
  to: string | string[]
  subject: string
  body: string
  isHtml?: boolean
}

export interface EmailSendResult {
  messageId: string
  recipientCount: number
}
