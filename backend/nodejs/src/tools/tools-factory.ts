import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { EmailProvider } from '@/providers/email/email-provider.js'
import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'
import { PineconeSearchTool } from './pinecone-search-tool.js'
import { EmailSendTool } from './email-send-tool.js'
import { ToolDefinition, ToolName } from './tool-dtos.js'

export interface ToolsFactoryDependencies {
  bedrockProvider?: BedrockProvider
  emailProvider?: EmailProvider
  pineconeRepository?: PineconeVectorRepository
}

export class ToolsFactory {
  constructor(private readonly dependencies: ToolsFactoryDependencies) {}

  createPineconeSearchTool(): PineconeSearchTool {
    if (!this.dependencies.pineconeRepository) {
      throw new Error(
        'PineconeVectorRepository is required to create PineconeSearchTool'
      )
    }
    if (!this.dependencies.bedrockProvider) {
      throw new Error(
        'BedrockProvider is required to create PineconeSearchTool'
      )
    }

    return new PineconeSearchTool(
      this.dependencies.pineconeRepository,
      this.dependencies.bedrockProvider
    )
  }

  createEmailSendTool(): EmailSendTool {
    if (!this.dependencies.emailProvider) {
      throw new Error('EmailProvider is required to create EmailSendTool')
    }

    return new EmailSendTool(this.dependencies.emailProvider)
  }

  // Get available tool definitions based on provided dependencies
  getToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = []

    if (this.canCreatePineconeSearchTool()) {
      definitions.push(PineconeSearchTool.getToolDefinition())
    }

    if (this.canCreateEmailSendTool()) {
      definitions.push(EmailSendTool.getToolDefinition())
    }

    return definitions
  }

  // Create available tools as a map for easy access
  createAvailableTools(): Map<string, PineconeSearchTool | EmailSendTool> {
    const tools = new Map<string, PineconeSearchTool | EmailSendTool>()

    if (this.canCreatePineconeSearchTool()) {
      tools.set(ToolName.PINECONE_SEARCH, this.createPineconeSearchTool())
    }

    if (this.canCreateEmailSendTool()) {
      tools.set(ToolName.SEND_EMAIL, this.createEmailSendTool())
    }

    return tools
  }

  // Helper methods to check if tools can be created
  canCreatePineconeSearchTool(): boolean {
    return !!(
      this.dependencies.pineconeRepository && this.dependencies.bedrockProvider
    )
  }

  canCreateEmailSendTool(): boolean {
    return !!this.dependencies.emailProvider
  }

  // Get list of available tool names
  getAvailableToolNames(): string[] {
    const names: string[] = []

    if (this.canCreatePineconeSearchTool()) {
      names.push(ToolName.PINECONE_SEARCH)
    }

    if (this.canCreateEmailSendTool()) {
      names.push(ToolName.SEND_EMAIL)
    }

    return names
  }
}
