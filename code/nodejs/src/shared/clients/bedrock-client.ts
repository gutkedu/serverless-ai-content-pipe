import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'

let client: BedrockRuntimeClient | null = null

export const bedrock = (): BedrockRuntimeClient => {
  if (client) {
    return client
  }
  client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION
  })
  return client
}
