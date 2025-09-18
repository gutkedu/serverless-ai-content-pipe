import { AgentInvocationRequest, AgentInvocationResult } from './agent-dto.js'

export interface AgentProvider {
  invokeAgent(request: AgentInvocationRequest): Promise<AgentInvocationResult>
}
