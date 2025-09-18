export interface AgentInvocationRequest {
  agentId: string
  agentAliasId: string
  sessionId: string
  inputText: string
  enableTrace?: boolean
}

export interface AgentInvocationResult {
  response: string
  citations?: unknown[]
  trace?: unknown[]
}
