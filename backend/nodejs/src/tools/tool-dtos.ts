/**
 * DTOs for tool definitions used in Bedrock function calling
 */

export enum ToolName {
  PINECONE_SEARCH = 'pinecone_search',
  SEND_EMAIL = 'send_email'
}

export interface ToolInputProperty {
  type: string
  description: string
  minimum?: number
  maximum?: number
  enum?: string[]
  items?: { type: string }
}

export interface ToolInputSchema {
  json: {
    type: 'object'
    properties: Record<string, ToolInputProperty>
    required: string[]
  }
}

export interface ToolSpec {
  name: string
  description: string
  inputSchema: ToolInputSchema
}

export interface ToolDefinition {
  toolSpec: ToolSpec
}

// Specific tool input/output DTOs
export interface PineconeSearchToolInput {
  query: string
  maxResults?: number
}

export interface PineconeSearchToolResult {
  title: string
  content: string
  url: string
  score: number
}

export interface EmailSendToolInput {
  to: string[]
  subject: string
  content: string
  contentType: 'html' | 'text'
}

export interface EmailSendToolResult {
  messageId: string
  status: 'sent'
  recipients: number
}
