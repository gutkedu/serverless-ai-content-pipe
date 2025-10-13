# AWS Support Case: Bedrock Agents Model Timeout Issue

## Case Information

**Subject:** Amazon Bedrock Agents - Consistent Model Timeout/Error Exceptions Across All Foundation Models

**Service:** Amazon Bedrock
**Category:** Agents
**Severity:** Business Impacting (production deployment blocked)

---

## Problem Description

We are experiencing consistent timeout and access denied errors when invoking Amazon Bedrock Agents with foundation models. The issue occurs across ALL tested models and configurations, but direct model invocation works successfully.

### Error Messages

Primary Error:
```
DependencyFailedException: Dependency resource: received model timeout/error exception from Bedrock. Try the request again.
```

Secondary Error (occasionally):
```
AccessDeniedException: Access denied when calling Bedrock. Check your request permissions and retry the request.
```

---

## Environment Details

- **AWS Account ID:** 396608768142
- **Region:** us-east-1
- **Agent ID:** NK1MO7MKTQ
- **Agent Alias ID:** PLKYEMGT0V
- **Agent Name:** ai-content-pipe-agent-strands
- **Agent Status:** PREPARED

---

## Models Tested (ALL Failed with Timeout)

1. **amazon.nova-micro-v1:0** - Timeout
2. **amazon.nova-lite-v1:0** - Timeout  
3. **amazon.nova-pro-v1:0** - Timeout
4. **meta.llama3-8b-instruct-v1:0** - Timeout/Tool use error
5. **meta.llama3-70b-instruct-v1:0** - Timeout
6. **meta.llama3-3-70b-instruct-v1:0** (via inference profile: us.meta.llama3-3-70b-instruct-v1:0) - Timeout

---

## Configuration Details

### Agent Configuration
- Foundation Model (current): amazon.nova-micro-v1:0
- Instruction: Minimal ("You are a helpful assistant. Use the available tools to answer questions.")
- Action Groups: 2 Lambda functions (pinecone_search, send_email)
- Knowledge Bases: None
- Guardrails: None

### IAM Permissions

**Agent Role ARN:** `arn:aws:iam::396608768142:role/AiContentPipeStatelessStac-BedrockAgentRole7C982E0C-itHNG1vthjTo`

Trust Policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "396608768142"
        },
        "ArnLike": {
          "aws:SourceArn": "arn:aws:bedrock:us-east-1:396608768142:agent/*"
        }
      }
    }
  ]
}
```

Identity Policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0",
      "Effect": "Allow"
    },
    {
      "Action": "lambda:InvokeFunction",
      "Resource": [
        "arn:aws:lambda:us-east-1:396608768142:function:AiContentPipeStatelessSta-PineconeSearchAction7A62-SV7Tr7by5Z1U",
        "arn:aws:lambda:us-east-1:396608768142:function:AiContentPipeStatelessStac-SendEmailActionBB4741B8-aIl8WIB4E5CM"
      ],
      "Effect": "Allow"
    }
  ]
}
```

### Lambda Invocation Role

**Invoke Lambda Role ARN:** `arn:aws:iam::396608768142:role/AiContentPipeStatelessSta-InvokeAgentServiceRole65E-fA2rjDz1YJjD`

Permissions:
```json
{
  "Action": "bedrock:InvokeAgent",
  "Resource": [
    "arn:aws:bedrock:us-east-1:396608768142:agent/NK1MO7MKTQ",
    "arn:aws:bedrock:us-east-1:396608768142:agent-alias/NK1MO7MKTQ/*"
  ],
  "Effect": "Allow"
}
```

---

## What Works Successfully

✅ **Direct Model Invocation** - Successfully tested with:
```bash
aws bedrock-runtime invoke-model \
  --model-id meta.llama3-70b-instruct-v1:0 \
  --body '{"prompt": "Hello", "max_gen_len": 50, "temperature": 0.7}' \
  --profile gutkedu-terraform --region us-east-1 /tmp/test.json
```
Result: SUCCESS - Model responds correctly

✅ **Action Group Lambda Functions** - Independently tested:
- Pinecone search Lambda: Returns 10 articles successfully
- Function ARN: `arn:aws:lambda:us-east-1:396608768142:function:AiContentPipeStatelessSta-PineconeSearchAction7A62-SV7Tr7by5Z1U`
- Test duration: 293ms
- Test result: SUCCESS

✅ **Agent Preparation** - Agent status shows PREPARED without errors

---

## What Fails Consistently

❌ **Agent Invocation via InvokeAgent API**

Test Command:
```bash
aws lambda invoke \
  --function-name AiContentPipeStatelessStack-InvokeAgentC8904518-7bZDBaXgqHd6 \
  --payload '{"topic":"AI","recipients":["eduardo.pedogutkoski@gmail.com"],"maxResults":5}' \
  --profile gutkedu-terraform --region us-east-1 /tmp/response.json
```

Result: Consistent timeout after 400-800ms

CloudWatch Log Sample:
```json
{
  "level": "ERROR",
  "message": "Error processing agent stream",
  "error": {
    "name": "DependencyFailedException",
    "message": "Dependency resource: received model timeout/error exception from Bedrock. Try the request again.",
    "$fault": "client"
  }
}
```

---

## Troubleshooting Steps Taken

1. ✅ Verified IAM permissions follow AWS best practices from documentation
2. ✅ Added trust policy conditions (aws:SourceAccount, aws:SourceArn)
3. ✅ Tested with multiple foundation models (Nova, Llama families)
4. ✅ Simplified agent instructions to minimal configuration
5. ✅ Verified action group Lambda functions work independently
6. ✅ Confirmed direct model invocation works successfully
7. ✅ Tested with models that support tool use (Nova family)
8. ✅ Verified agent status is PREPARED
9. ✅ Checked for Service Control Policies (none found - not in organization)
10. ✅ Verified no permission boundaries on IAM roles
11. ✅ Confirmed Lambda resource-based policies allow Bedrock invocation

---

## Timeline of Issue

- **First Occurrence:** October 12, 2025
- **Frequency:** 100% of agent invocation attempts fail
- **Pattern:** Consistent across all models and configurations
- **Duration:** Failures occur within 400-800ms (suggesting immediate rejection, not actual timeout)

---

## Infrastructure Details

**Deployment Method:** AWS CDK (TypeScript)
- CDK Version: 2.212.0
- Stack Name: AiContentPipeStatelessStack
- Region: us-east-1

**Lambda Configuration:**
- Runtime: Node.js 22.x
- Architecture: ARM64
- Memory: 512 MB
- Timeout: 60 seconds
- SDK: @aws-sdk/client-bedrock-agent-runtime (latest)

---

## Questions for AWS Support

1. **Are there any account-level restrictions or quotas on Bedrock Agents** that might not be visible through standard quota APIs?

2. **Is there a separate approval process required** for using Bedrock Agents beyond standard model access approval?

3. **Are there known regional capacity issues** with Bedrock Agents in us-east-1 that might cause consistent timeouts?

4. **Could you verify the agent configuration (NK1MO7MKTQ)** and identify any issues that might not be visible through the API?

5. **Are there additional CloudWatch logs or X-Ray traces** on the AWS side that could provide more insight into the timeout cause?

6. **Is there a difference between model access for direct API calls** versus model access for Bedrock Agents that requires separate enablement?

---

## Expected Behavior

The agent should:
1. Receive the user input via InvokeAgent API
2. Process the request using the configured foundation model
3. Optionally call action group Lambda functions (pinecone_search)
4. Return a generated response within reasonable time (<10 seconds)

---

## Business Impact

- **Production deployment blocked** - Cannot deploy AI content pipeline to production
- **Architecture decision pending** - Need to determine if Bedrock Agents is viable for our use case
- **Development resources** - Team blocked for 3+ days troubleshooting

---

## Request

Please investigate why Bedrock Agents consistently timeout when invoking foundation models in our account, despite:
- Correct IAM permissions
- Successful direct model invocation
- Working action group Lambdas
- Multiple models tested

We need to determine if this is:
1. An account-level configuration issue
2. A regional capacity/availability issue
3. A quota or limit we're hitting
4. A bug in the Bedrock Agents service

---

## Contact Information

- **Primary Contact:** Eduardo Gutkowski
- **Email:** eduardo.pedogutkoski@gmail.com
- **Preferred Contact Method:** Email
- **Timezone:** America/Sao_Paulo (UTC-3)
- **Availability:** Business hours (9 AM - 6 PM BRT)

---

## Additional Resources

**Agent Invocation URL:** https://aqu5x5wovvt3cbppqgqbxsqvze0rjiax.lambda-url.us-east-1.on.aws/

**CloudWatch Log Groups:**
- Agent Invoke Lambda: `/aws/lambda/AiContentPipeStatelessStack-InvokeAgentC8904518-7bZDBaXgqHd6`
- Pinecone Action: `/aws/lambda/AiContentPipeStatelessSta-PineconeSearchAction7A62-SV7Tr7by5Z1U`

**X-Ray Trace ID (sample):** `1-68ec3624-148d0dd036e9c4c87ac27f1b`

---

## Attachments to Include

1. CloudWatch logs showing the timeout error
2. X-Ray trace showing the failure point
3. IAM policy documents (trust + identity policies)
4. Agent configuration JSON (from get-agent API call)

---

**Case Priority Request:** High - Production deployment blocked
**Follow-up Preference:** Daily updates on investigation progress
