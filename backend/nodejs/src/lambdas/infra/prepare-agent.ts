import {
  BedrockAgentClient,
  PrepareAgentCommand
} from '@aws-sdk/client-bedrock-agent'

const client = new BedrockAgentClient({ region: process.env.AWS_REGION })

export const handler = async (event: any): Promise<any> => {
  console.log('Prepare Agent Custom Resource Event:', JSON.stringify(event))

  const { RequestType, ResourceProperties } = event
  const agentId = ResourceProperties.AgentId

  try {
    // Only prepare on Create and Update, not Delete
    if (RequestType === 'Create' || RequestType === 'Update') {
      console.log(`Preparing agent: ${agentId}`)

      const command = new PrepareAgentCommand({
        agentId
      })

      const response = await client.send(command)
      console.log('Agent prepared successfully:', response)

      return {
        PhysicalResourceId: `prepare-agent-${agentId}`,
        Data: {
          AgentId: agentId,
          AgentStatus: response.agentStatus,
          PreparedAt: response.preparedAt?.toISOString()
        }
      }
    }

    if (RequestType === 'Delete') {
      console.log('Delete request - no action needed')
      return {
        PhysicalResourceId: `prepare-agent-${agentId}`
      }
    }
  } catch (error) {
    console.error('Error preparing agent:', error)
    throw error
  }
}
