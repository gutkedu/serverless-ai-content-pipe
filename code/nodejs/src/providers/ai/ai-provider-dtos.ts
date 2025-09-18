export interface TitanEmbeddingResponse {
  embedding: number[]
  inputTextTokenCount: number
}

export interface FunctionCallingRequest {
  prompt: string
  tools: unknown[] // Using unknown to avoid importing Bedrock types in DTOs
  maxTokens?: number
  temperature?: number
}

export interface FunctionCallingResult {
  response: string
  toolCalls: Array<{
    name: string
    input: unknown
    result: unknown
  }>
}

export interface ToolExecutionRequest {
  toolName: string
  input: unknown
}
