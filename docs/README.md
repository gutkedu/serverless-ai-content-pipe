# AWS Support Documentation - Bedrock Agents Timeout Issue

This folder contains all documentation and evidence for the AWS Support case regarding Bedrock Agents timeout issues.

## 📁 Files Overview

| File | Purpose | Size |
|------|---------|------|
| `aws-support-case.md` | **Complete support case description** - Copy this into AWS Support Center | ~8 KB |
| `support-case-submission-guide.md` | **Step-by-step guide** for submitting the case | ~4 KB |
| `issue-diagnosis-summary.md` | **Executive summary** of the problem and troubleshooting | ~3 KB |
| `agent-configuration.json` | Agent configuration from AWS API | Variable |
| `cloudwatch-errors.log` | Recent error logs from CloudWatch | Variable |
| `agent-iam-role.json` | IAM role configuration | ~1 KB |
| `agent-iam-policy.json` | IAM policy document | ~1 KB |

## 🚀 Quick Start

### Option 1: Submit via AWS Console (Recommended)

1. Read: `support-case-submission-guide.md`
2. Go to: https://console.aws.amazon.com/support
3. Click: **"Create case"** → **"Technical support"**
4. Copy content from: `aws-support-case.md`
5. Attach files:
   - `agent-configuration.json`
   - `cloudwatch-errors.log`
   - `agent-iam-role.json`
   - `agent-iam-policy.json`
6. Submit and save your Case ID

### Option 2: Submit via AWS CLI

```bash
# Requires AWS Support plan
aws support create-case \
  --subject "Amazon Bedrock Agents - Model Timeout Issue" \
  --service-code "bedrock" \
  --severity-code "urgent" \
  --category-code "general-info" \
  --communication-body "$(cat docs/aws-support-case.md)" \
  --cc-email-addresses "eduardo.pedogutkoski@gmail.com" \
  --profile gutkedu-terraform \
  --region us-east-1
```

### Option 3: Post to AWS re:Post (Free, Community Support)

1. Go to: https://repost.aws/
2. Click: **"Ask a question"**
3. Title: "Amazon Bedrock Agents - Consistent Model Timeout Across All Foundation Models"
4. Tags: `amazon-bedrock`, `agents`, `timeout`
5. Copy content from: `issue-diagnosis-summary.md` (shorter version)
6. Post and monitor for responses

## 📋 Problem Summary

**Issue:** Bedrock Agents consistently timeout when invoking foundation models  
**Error:** `DependencyFailedException: received model timeout/error exception`  
**Scope:** 100% failure rate across 6 models, multiple configurations  
**Impact:** Production deployment blocked  

**What Works:**
- ✅ Direct model invocation (tested & confirmed)
- ✅ Action group Lambdas (tested & confirmed)
- ✅ IAM permissions (verified against AWS docs)

**What Fails:**
- ❌ Agent orchestration → model invocation (every single time)

## 🔍 Key Details for Support

- **Agent ID:** NK1MO7MKTQ
- **Region:** us-east-1
- **Account:** 396608768142
- **Models Tested:** Nova Micro/Lite/Pro, Llama 3/3.1/3.3 (all failed)
- **Error Pattern:** Timeout after 400-800ms (too fast for real timeout)

## 📞 Support Case Priority

**Recommended Severity:** **Urgent** (Production System Impaired)

Justification:
- Production deployment blocked
- Multiple days of troubleshooting exhausted
- Systematic testing confirms platform-level issue
- Business impact: Cannot deliver AI content pipeline

Expected Response Time: 4 hours (with Business or Enterprise Support)

## 📚 For Your Reference

### Read First
1. `issue-diagnosis-summary.md` - Quick overview of the problem
2. `support-case-submission-guide.md` - How to submit the case

### Use When Submitting
1. `aws-support-case.md` - Copy entire content to support case
2. `agent-configuration.json` - Attach to support case
3. `cloudwatch-errors.log` - Attach to support case
4. `agent-iam-role.json` - Attach to support case
5. `agent-iam-policy.json` - Attach to support case

## 🎯 Success Criteria

Case is resolved when this command succeeds:

```bash
aws lambda invoke \
  --function-name AiContentPipeStatelessStack-InvokeAgentC8904518-7bZDBaXgqHd6 \
  --payload '{"topic":"AI","recipients":["eduardo.pedogutkoski@gmail.com"],"maxResults":5}' \
  --profile gutkedu-terraform \
  --region us-east-1 \
  response.json

cat response.json | jq '.success'
# Expected output: true
```

## 🔄 Alternative Actions

While waiting for AWS Support:

### 1. Test in Different Region (Quick Test)
```bash
# Deploy to us-west-2 instead
cd ../infra
cdk deploy AiContentPipeStatelessStack \
  --profile gutkedu-terraform \
  --context region=us-west-2
```

### 2. Implement Workaround (4-8 hours work)
Skip Bedrock Agents, use direct Bedrock API:
- Keep Pinecone search Lambda
- Add new "orchestrator" Lambda
- Call Bedrock InvokeModel directly
- Manual workflow coordination

### 3. Wait for Support Response
- Expected: 4-24 hours
- Monitor email: eduardo.pedogutkoski@gmail.com
- Track via: AWS Support Center

## ❓ FAQ

**Q: Do we need AWS Support plan?**  
A: Recommended. Developer ($29/mo) or Business ($100/mo minimum). Without it, use AWS re:Post (free community support).

**Q: How long will resolution take?**  
A: Typically 24-72 hours for platform issues. May be faster if it's a known issue.

**Q: Can we deploy without Bedrock Agents?**  
A: Yes, we can implement a workaround using direct Bedrock API calls. Estimated 4-8 hours of development.

**Q: Is this blocking production?**  
A: Yes. The AI content pipeline cannot function without working agent orchestration or equivalent manual orchestration.

**Q: What if AWS says it's not supported?**  
A: We pivot to manual orchestration architecture. The building blocks work (direct model invocation, Pinecone search), just need to wire them together differently.

## 📬 Contact

**Technical Owner:** Eduardo Gutkowski  
**Email:** eduardo.pedogutkoski@gmail.com  
**GitHub:** @gutkedu  
**Project:** serverless-ai-content-pipe

## 🏷️ Version History

- **v1.0** (Oct 12, 2025): Initial support case documentation
- Case prepared after 3 days of systematic troubleshooting
- All AWS best practices verified
- Ready for submission

---

**Next Step:** Submit support case via AWS Console or CLI  
**Estimated Time to Submit:** 15-20 minutes  
**Follow-up:** Monitor email for AWS response within 24 hours
