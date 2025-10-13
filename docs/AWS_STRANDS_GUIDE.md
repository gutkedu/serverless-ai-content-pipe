# AWS Strands Implementation Guide

## 🚀 Overview

This project now uses **AWS Strands architecture** with **Bedrock AgentCore** for a modern, scalable AI content pipeline.

## 🏗️ Architecture

### AWS Strands Principles Applied

1. **Agent-First Design**: Bedrock Agent orchestrates all workflows
2. **Simplified Actions**: Lightweight Lambda functions for specific tasks
3. **Native Observability**: X-Ray tracing, CloudWatch metrics, agent traces
4. **Developer Freedom**: Clean separation between infrastructure and business logic

### Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    STATEFUL STACK                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐            │
│  │ S3 Bucket│  │ SSM Params│  │ EventBridge   │            │
│  └──────────┘  └──────────┘  └───────────────┘            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 STRANDS STATELESS STACK                     │
│                                                             │
│  PHASE 1: Data Ingestion (A2A Pattern)                     │
│  ┌────────────────┐                                        │
│  │ EventBridge    │──────▶ Lambda: Fetch News              │
│  │ Scheduler      │         │                              │
│  └────────────────┘         └──▶ S3 Bucket                 │
│                                                             │
│  PHASE 2: Embedding Processing (RAG)                       │
│  ┌────────────────┐                                        │
│  │ S3 Event       │──────▶ Lambda: Process Embeddings      │
│  │ Notification   │         │                              │
│  └────────────────┘         ├──▶ Bedrock Embeddings        │
│                             └──▶ Pinecone Vector DB         │
│                                                             │
│  PHASE 3: Agent Orchestration (Strands + MCP)             │
│  ┌────────────────┐                                        │
│  │ Function URL   │──────▶ Lambda: Invoke Agent            │
│  │ (HTTP API)     │         │                              │
│  └────────────────┘         ▼                              │
│                      ┌─────────────────┐                   │
│                      │ Bedrock Agent   │                   │
│                      │ (AgentCore)     │                   │
│                      └────────┬────────┘                   │
│                               │                             │
│                  ┌────────────┴────────────┐               │
│                  │                         │               │
│          ┌───────▼────────┐       ┌───────▼────────┐      │
│          │ Action Lambda  │       │ Action Lambda  │      │
│          │ Pinecone Search│       │ Send Email     │      │
│          └────────────────┘       └────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Key Components

### Bedrock Agent Configuration

- **Foundation Model**: Amazon Nova Micro v1
- **Agent Runtime**: Native Bedrock AgentCore
- **Action Groups**:
  - `search-actions`: Pinecone vector search
  - `email-actions`: AWS SES email delivery
- **Features**:
  - Streaming responses
  - Session management
  - Full trace logging
  - Prompt orchestration

### Lambda Functions

#### 1. **Fetch News Scheduled** (Phase 1)
- Triggered: Every 24 hours via EventBridge Scheduler
- Purpose: Fetch news articles from NewsAPI
- Output: JSON files in S3

#### 2. **Process News Embeddings** (Phase 2)
- Triggered: S3 object creation event
- Purpose: Generate embeddings and store in Pinecone
- Uses: Bedrock Titan Embeddings v2

#### 3. **Invoke Agent** (Phase 3 - NEW!)
- Triggered: HTTP request via Function URL
- Purpose: Simplified agent invocation interface
- Features: Streaming, session management, error handling

#### 4. **Pinecone Search Action**
- Purpose: Search vector database for relevant articles
- Used by: Bedrock Agent action group

#### 5. **Send Email Action**
- Purpose: Send formatted emails via SES
- Used by: Bedrock Agent action group

## 🎯 Key Differences from Previous Architecture

### Before (Custom Implementation)
```typescript
// Manual function calling orchestration
const result = await bedrockProvider.executeWithFunctionCalling({
  prompt,
  tools,
  maxTokens: 4000
}, toolExecutor);
```

### After (AWS Strands)
```typescript
// Agent handles everything
const command = new InvokeAgentCommand({
  agentId: AGENT_ID,
  agentAliasId: AGENT_ALIAS_ID,
  sessionId,
  inputText: prompt,
  enableTrace: true
});
```

### Benefits

| Aspect | Before | After (Strands) |
|--------|--------|-----------------|
| **Complexity** | High - manual orchestration | Low - agent handles it |
| **Code Lines** | ~300+ in use case | ~50 in invocation |
| **Observability** | Custom logging | Native traces |
| **Tool Execution** | Manual | Automatic |
| **Session Management** | DIY | Built-in |
| **Error Handling** | Custom | Native retries |
| **Scaling** | Manual tuning | Auto-optimized |

## 🚦 Getting Started

### Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Node.js 22+** installed
3. **AWS CDK** installed: `npm install -g aws-cdk`
4. **Required API Keys**:
   - NewsAPI key
   - Pinecone API key
5. **AWS SES**: Verify sender email addresses

### Installation

```bash
# Install dependencies
cd infra && npm install
cd ../backend/nodejs && npm install

# Bootstrap CDK (first time only)
cd ../../infra
cdk bootstrap
```

### Configuration

Update SSM parameters in the stateful stack or manually:

```bash
# After deploying stateful stack, update these:
aws ssm put-parameter \
  --name /ai-content-pipe/news-api-key \
  --value "your-newsapi-key" \
  --type SecureString \
  --overwrite

aws ssm put-parameter \
  --name /ai-content-pipe/pinecone-api-key \
  --value "your-pinecone-key" \
  --type SecureString \
  --overwrite

aws ssm put-parameter \
  --name /ai-content-pipe/from-email \
  --value "verified@yourdomain.com" \
  --type String \
  --overwrite

aws ssm put-parameter \
  --name /ai-content-pipe/default-to-email \
  --value "recipient@example.com" \
  --type String \
  --overwrite
```

### Deployment

```bash
cd infra

# Deploy stateful resources first
cdk deploy AiContentPipeStatefulStack

# Deploy Strands architecture
cdk deploy AiContentPipeStrandsStack

# Or deploy both
cdk deploy --all
```

### Post-Deployment

After deployment, the agent needs to be prepared:

```bash
# Get the agent ID from stack outputs
AGENT_ID=$(aws cloudformation describe-stacks \
  --stack-name AiContentPipeStrandsStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentId`].OutputValue' \
  --output text)

# Prepare the agent (required after creation/updates)
aws bedrock-agent prepare-agent --agent-id $AGENT_ID
```

## 🧪 Testing

### Test Agent Invocation

```bash
# Get the Function URL from stack outputs
FUNCTION_URL=$(aws cloudformation describe-stacks \
  --stack-name AiContentPipeStrandsStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentInvocationUrl`].OutputValue' \
  --output text)

# Invoke the agent
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Artificial Intelligence",
    "recipients": ["your-email@example.com"],
    "maxResults": 5
  }'
```

### Test Response Format

```json
{
  "success": true,
  "response": "I've successfully generated and sent the AI newsletter...",
  "sessionId": "session-1234567890-abc123",
  "citations": [...],
  "trace": [...]
}
```

### Manual Lambda Testing

```bash
# Trigger news fetch manually
aws lambda invoke \
  --function-name $(aws cloudformation describe-stack-resources \
    --stack-name AiContentPipeStrandsStack \
    --query "StackResources[?LogicalResourceId=='FetchNewsScheduled'].PhysicalResourceId" \
    --output text) \
  --payload '{"topic":"AI","page":1,"pageSize":5}' \
  response.json
```

## 📊 Monitoring

### CloudWatch Logs

```bash
# View agent invocation logs
aws logs tail /aws/lambda/AiContentPipeStrandsStack-InvokeAgent --follow

# View action group logs
aws logs tail /aws/lambda/AiContentPipeStrandsStack-PineconeSearchAction --follow
aws logs tail /aws/lambda/AiContentPipeStrandsStack-SendEmailAction --follow
```

### X-Ray Tracing

The Strands architecture has X-Ray tracing enabled by default:

1. Go to AWS X-Ray console
2. View service map
3. Analyze traces for bottlenecks
4. Monitor error rates

### Agent Traces

View detailed agent execution traces:

```typescript
// Traces are returned in the response
{
  "trace": [
    {
      "trace": {
        "orchestrationTrace": {
          "invocationInput": {...},
          "rationale": {...},
          "observation": {...}
        }
      }
    }
  ]
}
```

## 🔧 Development

### Local Testing

```bash
# Run TypeScript type checking
cd backend/nodejs
npm run typecheck

# Run linting
npm run lint

# Run tests
npm test
```

### CDK Development

```bash
cd infra

# Synthesize CloudFormation template
cdk synth

# View differences
cdk diff

# Deploy with hotswap (faster for Lambda-only changes)
cdk deploy --hotswap
```

## 🎛️ Configuration Options

### Agent Configuration

Edit `strands-stateless-stack.ts` to customize:

- **Foundation Model**: Change to Claude, Nova Pro, etc.
- **Temperature**: Adjust for creativity vs. consistency
- **Max Tokens**: Control response length
- **Session TTL**: Modify idle timeout
- **Guardrails**: Add content moderation

### Action Groups

Add new capabilities by:

1. Creating new Lambda action handler
2. Adding action group to agent configuration
3. Defining function schema
4. Granting necessary permissions

Example:

```typescript
{
  actionGroupName: "twitter-actions",
  description: "Post to Twitter/X",
  actionGroupExecutor: {
    lambda: postToTwitterLambda.functionArn,
  },
  functionSchema: {
    functions: [{
      name: "post_tweet",
      description: "Post a tweet",
      parameters: {
        text: { type: "string", required: true }
      }
    }]
  }
}
```

## 🐛 Troubleshooting

### Agent Not Prepared

**Error**: `ResourceNotFoundException: Agent not found`

**Solution**: 
```bash
aws bedrock-agent prepare-agent --agent-id $AGENT_ID
```

### Lambda Timeout

**Error**: Function timed out after 30 seconds

**Solution**: Increase timeout in `strands-stateless-stack.ts`:
```typescript
timeout: cdk.Duration.minutes(5)
```

### Bedrock Throttling

**Error**: `ThrottlingException`

**Solution**: 
- Request quota increase in Service Quotas
- Add exponential backoff in Lambda
- Use agent's built-in retry logic

### Permission Errors

**Error**: `Access Denied`

**Solution**: Check IAM policies in CDK stack and ensure:
- Lambda has Bedrock invoke permissions
- Agent has Lambda invoke permissions
- SSM parameter access is granted

## 📈 Cost Optimization

### Pricing Considerations

- **Bedrock Agent**: Pay per token processed
- **Lambda**: Pay per invocation and duration
- **Bedrock Models**: Nova Micro is cost-effective
- **S3**: Minimal storage costs
- **Pinecone**: Depends on index size

### Optimization Tips

1. **Use Nova Micro** for agent orchestration (cheapest)
2. **Batch processing** for embeddings
3. **Cache results** in S3 when possible
4. **Short Lambda timeouts** to avoid waste
5. **Monitor unused resources** with AWS Cost Explorer

## 🔐 Security Best Practices

1. **IAM Roles**: Least privilege principle
2. **SSM Parameters**: Use SecureString with KMS
3. **Function URL**: Use IAM authentication in production
4. **VPC**: Deploy Lambdas in VPC for sensitive data
5. **Secrets Rotation**: Rotate API keys regularly
6. **Logging**: Don't log sensitive data

## 📚 Additional Resources

- [AWS Bedrock Agents Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS Strands Blog Posts](https://aws.amazon.com/blogs/compute/)
- [Bedrock AgentCore API Reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_Operations_Agents_for_Amazon_Bedrock_Runtime.html)
- [AWS Lambda Powertools](https://docs.powertools.aws.dev/lambda/typescript/latest/)

## 🤝 Contributing

When adding new features:

1. Follow AWS Strands principles
2. Keep Lambdas focused and simple
3. Add comprehensive logging
4. Update this documentation
5. Test end-to-end workflow

## 📝 License

See LICENSE file in repository root.
