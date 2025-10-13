#!/bin/bash
# Script to remove Bedrock Agent specific files

echo "🗑️  Removing Bedrock Agent specific files..."

# Agent Lambdas
rm -f backend/nodejs/src/lambdas/invoke-bedrock-agent.ts
rm -f backend/nodejs/src/lambdas/generate-content-agent.ts
rm -f backend/nodejs/src/lambdas/infra/prepare-agent.ts
rm -f backend/nodejs/src/lambdas/bedrock-agent-actions/pinecone-search.ts
rm -f backend/nodejs/src/lambdas/bedrock-agent-actions/send-email.ts
rmdir backend/nodejs/src/lambdas/bedrock-agent-actions 2>/dev/null

# Agent providers
rm -f backend/nodejs/src/providers/agent/agent-provider.ts
rm -f backend/nodejs/src/providers/agent/bedrock-agent-provider.ts
rm -f backend/nodejs/src/providers/agent/agent-dto.ts
rmdir backend/nodejs/src/providers/agent 2>/dev/null

# Agent clients
rm -f backend/nodejs/src/shared/clients/bedrock-agent.ts

# Tools (agent action groups)
rm -f backend/nodejs/src/tools/pinecone-search-tool.ts
rm -f backend/nodejs/src/tools/email-send-tool.ts
rm -f backend/nodejs/src/tools/tools-factory.ts
rm -f backend/nodejs/src/tools/tool-dtos.ts
rmdir backend/nodejs/src/tools 2>/dev/null

echo "✅ Cleanup complete!"
echo ""
echo "📊 Summary:"
echo "  - Removed agent-specific Lambdas"
echo "  - Removed agent providers"
echo "  - Removed agent tools"
echo "  - Kept: use-cases, core providers, repositories, shared utilities"
echo ""
echo "🚀 Next: Build the manual orchestrator Lambda"
