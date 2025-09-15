export interface AIProvider {
  /**
   * Generates a response based on the provided prompt.
   * @param prompt The input text to generate a response for.
   * @returns A promise that resolves to the generated response.
   */
  generateResponse(prompt: string): Promise<string>
  generateBedrockEmbedding(text: string): Promise<number[]>
}
