#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AiContentPipeStatefulStack } from "../lib/stateful-stack";
import { AiContentPipeStatelessStack } from "../lib/stateless-stack";

const app = new cdk.App();

// Stateful stack - persistent resources (S3, SSM Parameters, EventBridge)
new AiContentPipeStatefulStack(app, "AiContentPipeStatefulStack", {
  env: {
    region: "us-east-1",
  },
  description: "Stateful resources for AI Content Pipeline",
});

// Stateless stack - Lambda functions and Bedrock Agent (AWS Strands Architecture)
new AiContentPipeStatelessStack(app, "AiContentPipeStatelessStack", {
  env: {
    region: "us-east-1",
  },
  description: "AI Content Pipeline with AWS Strands and Bedrock AgentCore",
});
