import {
  FunctionCallingRequest,
  FunctionCallingResult
} from './ai-provider-dtos.js'

export interface ToolExecutor {
  executeTool(toolName: string, input: unknown): Promise<unknown>
}

export interface AIProvider {
  /**
   * Generates a response based on the provided prompt.
   * @param prompt The input text to generate a response for.
   * @returns A promise that resolves to the generated response.
   */
  generateResponse(prompt: string): Promise<string>

  /**
   * Generates embeddings for the provided text.
   * @param text The input text to generate embeddings for.
   * @returns A promise that resolves to the embedding vector.
   */
  generateBedrockEmbedding(text: string): Promise<number[]>

  /**
   * Executes function calling with tools.
   * @param request The function calling request with prompt and tools.
   * @param toolExecutor The executor that handles tool invocations.
   * @returns A promise that resolves to the function calling result.
   */
  executeWithFunctionCalling(
    request: FunctionCallingRequest,
    toolExecutor: ToolExecutor
  ): Promise<FunctionCallingResult>
}
