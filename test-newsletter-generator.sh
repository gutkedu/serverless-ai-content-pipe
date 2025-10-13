#!/bin/bash

# Test the Manual Orchestrator Newsletter Generator
# This script invokes the Lambda Function URL with a test payload

FUNCTION_URL="https://czschxbqagxdig24n2oyfkfele0avmjl.lambda-url.us-east-1.on.aws/"

# Test payload
PAYLOAD='{
  "topic": "Artificial Intelligence",
  "recipients": ["eduardo.pedogutkoski@gmail.com"],
  "maxArticles": 20
}'

echo "🚀 Testing Newsletter Generator (Manual Orchestrator)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Topic: Artificial Intelligence"
echo "Recipients: eduardo.pedogutkoski@gmail.com"
echo "Max Articles: 5"
echo ""
echo "📡 Sending request to Function URL..."
echo ""

# Invoke using AWS CLI with IAM auth (sigv4)
aws lambda invoke \
  --profile gutkedu-terraform \
  --region us-east-1 \
  --function-name arn:aws:lambda:us-east-1:396608768142:function:AiContentPipeStatelessSta-GenerateNewsletter37D375-4v8LrSuAXscd \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  response.json

echo ""
echo "📥 Response:"
cat response.json | jq .
echo ""

# Check if successful
if jq -e '.success == true' response.json > /dev/null; then
  echo "✅ Newsletter generated and sent successfully!"
  echo ""
  echo "📊 Results:"
  jq -r '"  - Articles found: \(.articlesFound)"' response.json
  jq -r '"  - Email sent: \(.emailSent)"' response.json
  jq -r '"  - Message ID: \(.messageId)"' response.json
else
  echo "❌ Newsletter generation failed"
  echo ""
  echo "Error message:"
  jq -r '.message' response.json
fi

echo ""
echo "🧹 Cleaning up..."
rm -f response.json
echo "✨ Done!"
