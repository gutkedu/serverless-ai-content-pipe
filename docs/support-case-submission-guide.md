# How to Submit AWS Support Case

## Step 1: Access AWS Support Center

1. Log into AWS Console: https://console.aws.amazon.com/
2. Click on the **"?"** icon (Support) in the top right corner
3. Select **"Support Center"**

## Step 2: Create New Case

1. Click **"Create case"** button
2. Select **"Technical support"**

## Step 3: Fill Case Details

### Service Selection
- **Service:** Bedrock
- **Category:** Agents (or General if Agents not available)
- **Severity:** Production system impaired

### Case Description

**Subject:**
```
Amazon Bedrock Agents - Consistent Model Timeout/Error Exceptions Across All Foundation Models
```

**Description:**
Copy the entire content from `docs/aws-support-case.md` into the description field.

## Step 4: Attach Files

Attach these files from the `docs/` folder:
- ✅ `agent-configuration.json` - Complete agent configuration
- ✅ `cloudwatch-errors.log` - Recent error logs
- ✅ `agent-iam-role.json` - IAM role details
- ✅ `agent-iam-policy.json` - IAM policy details

## Step 5: Contact Preferences

- **Preferred contact language:** English
- **Contact method:** Email (or Web if you want to track via console)
- **Email:** eduardo.pedogutkoski@gmail.com

## Step 6: Submit

Click **"Submit"** and note your **Case ID** for tracking.

---

## Expected Response Times

Based on severity level:
- **Critical (production down):** 1 hour response
- **Urgent (production impaired):** 4 hours response  ⬅️ Recommended
- **Normal (dev/test impacted):** 12 hours response
- **Low (general guidance):** 24 hours response

---

## Follow-up Actions

After submitting:

1. **Save Case ID** - Keep it in a safe place
2. **Monitor Email** - Check regularly for AWS responses
3. **Respond Promptly** - Answer any questions from AWS as quickly as possible
4. **Escalate if Needed** - If no response within expected time, use the escalation option

---

## Alternative: AWS CLI Method

You can also create a support case via CLI:

```bash
aws support create-case \
  --subject "Amazon Bedrock Agents - Model Timeout Issue" \
  --service-code "bedrock" \
  --severity-code "urgent" \
  --category-code "agents" \
  --communication-body "$(cat docs/aws-support-case.md)" \
  --cc-email-addresses "eduardo.pedogutkoski@gmail.com" \
  --profile gutkedu-terraform \
  --region us-east-1
```

Note: Requires AWS Support plan (Developer, Business, or Enterprise)

---

## If You Don't Have AWS Support Plan

### Free Support Options:

1. **AWS re:Post** (Community Forum)
   - URL: https://repost.aws/
   - Post your issue with tag: `amazon-bedrock` and `agents`
   - Free but community-driven responses

2. **AWS GitHub Issues** (For SDK issues)
   - URL: https://github.com/aws/aws-sdk-js-v3/issues
   - Only if you suspect SDK bug

3. **AWS Account Team**
   - If you have an assigned account manager or TAM
   - Contact them directly for escalation

### Recommended: Upgrade to Business Support

For production workloads, Business Support ($100/month minimum) provides:
- 24/7 phone, email, and chat access
- < 1 hour response for production-down issues
- < 4 hours for production-impaired issues
- Architecture guidance
- Access to AWS Trusted Advisor

---

## Tracking Your Case

1. **Via Console:**
   - Support Center → My Support Cases
   - Check status and read responses

2. **Via Email:**
   - All case updates sent to your email
   - Reply directly to email to add responses

3. **Via CLI:**
   ```bash
   aws support describe-cases \
     --case-id-list "case-XXXXXXXXXXXXX" \
     --profile gutkedu-terraform
   ```

---

## Questions You May Be Asked

Be prepared to answer:

1. **Can you test in another region?**
   - us-west-2 recommended as alternative

2. **Can you share CloudTrail logs?**
   - Enable CloudTrail if not already enabled
   - Filter for Bedrock Agent events

3. **Can you test with a simpler agent?**
   - We already tested with minimal configuration

4. **Have you checked service quotas?**
   ```bash
   aws service-quotas list-service-quotas \
     --service-code bedrock \
     --profile gutkedu-terraform \
     --region us-east-1
   ```

5. **Can you provide X-Ray traces?**
   - X-Ray is already enabled
   - Sample trace ID: 1-68ec3624-148d0dd036e9c4c87ac27f1b

---

## Success Metrics

Case resolved when:
- ✅ Agent successfully invokes foundation models
- ✅ Agent completes orchestration without timeout
- ✅ Action groups are called as expected
- ✅ Generated responses returned within 10 seconds

---

## Need Help?

If you need assistance with the support case:
1. Ping your AWS account manager (if you have one)
2. Post on internal Slack/Teams for help
3. Consider engaging AWS Professional Services for architecture review
