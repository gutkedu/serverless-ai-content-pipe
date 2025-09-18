import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime'

let client: BedrockAgentRuntimeClient | null = null

export const bedrockAgent = (): BedrockAgentRuntimeClient => {
  if (client) {
    return client
  }
  client = new BedrockAgentRuntimeClient({
    region: process.env.AWS_REGION
  })
  return client
}
