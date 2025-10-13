import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import { OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import { StatefulStackExportsEnum } from "./enums/exports-enum";

/**
 * AI Content Pipeline - Stateless Stack
 *
 * AWS Strands Architecture with Bedrock AgentCore:
 * - Agent-first design for AI orchestration
 * - Simplified action groups with minimal Lambda logic
 * - Native AWS observability and X-Ray tracing
 * - Function URL instead of API Gateway for modern serverless
 */
export class AiContentPipeStatelessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Shared Lambda Layer
     */
    const nodejsDepsLambdaLayer = new lambda.LayerVersion(
      this,
      "NodejsDepsLambdaLayer",
      {
        code: lambda.Code.fromAsset("../backend/nodejs/layers/deps"),
        compatibleRuntimes: [
          lambda.Runtime.NODEJS_20_X,
          lambda.Runtime.NODEJS_22_X,
        ],
        description: "Node.js dependencies layer",
      }
    );

    const powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "PowertoolsLayer",
      "arn:aws:lambda:us-east-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:34"
    );

    /**
     * Global Lambda Configuration
     */
    const globalLambdaConfig = {
      environment: {
        NEWS_API_KEY_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.NEWS_API_KEY_PARAM
        ),
        PINECONE_API_KEY_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.PINECONE_API_KEY_PARAM
        ),
        BUCKET_NAME: cdk.Fn.importValue(StatefulStackExportsEnum.MAIN_BUCKET),
        FROM_EMAIL_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.FROM_EMAIL_PARAM
        ),
        DEFAULT_TO_EMAIL_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.DEFAULT_TO_EMAIL_PARAM
        ),
        POWERTOOLS_SERVICE_NAME: "ai-content-pipe-strands",
        POWERTOOLS_METRICS_NAMESPACE: "AIContentPipe",
        POWERTOOLS_LOG_LEVEL: "INFO",
        BEDROCK_MODEL_ID: "amazon.nova-micro-v1:0",
        EMBEDDING_MODEL_ID: "amazon.titan-embed-text-v1", // v1 = 1536 dims (matches Pinecone index)
      },
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      layers: [nodejsDepsLambdaLayer, powertoolsLayer],
      tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
      bundling: {
        minify: true,
        sourceMap: true,
        format: OutputFormat.ESM,
        target: "node22",
      },
    };

    /**
     * ========================================
     * PHASE 1: Data Ingestion (A2A Pattern)
     * ========================================
     */

    const fetchNewsScheduled = new nodeLambda.NodejsFunction(
      this,
      "FetchNewsScheduled",
      {
        handler: "fetchNewsScheduledHandler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/fetch-news-scheduled.ts"
        ),
        description: "Fetch news articles on schedule (A2A pattern)",
        memorySize: 512,
        timeout: cdk.Duration.seconds(30),
        ...globalLambdaConfig,
      }
    );

    // Permissions for news fetching
    fetchNewsScheduled.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "kms:Decrypt"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/ai-content-pipe/news-api-key`,
          `arn:aws:kms:${this.region}:${this.account}:key/*`,
        ],
      })
    );

    const mainBucket = s3.Bucket.fromBucketName(
      this,
      "MainBucket",
      cdk.Fn.importValue(StatefulStackExportsEnum.MAIN_BUCKET)
    );

    fetchNewsScheduled.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:GetObject"],
        resources: [`${mainBucket.bucketArn}/*`],
      })
    );

    // EventBridge Scheduler for automated fetching
    const schedulerRole = new iam.Role(this, "SchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
      description: "Role for EventBridge Scheduler",
    });

    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [fetchNewsScheduled.functionArn],
      })
    );

    new scheduler.CfnSchedule(this, "FetchNewsSchedule", {
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: "rate(24 hours)",
      target: {
        arn: fetchNewsScheduled.functionArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          topic: "Artificial Intelligence",
          page: 1,
          pageSize: 10,
        }),
      },
      name: "ai-content-pipe-fetch-news-schedule",
      description: "Triggers news fetching every 24 hours",
      state: "ENABLED",
    });

    /**
     * ========================================
     * PHASE 2: Embedding Processing (RAG)
     * ========================================
     */

    const processNewsEmbeddings = new nodeLambda.NodejsFunction(
      this,
      "ProcessNewsEmbeddings",
      {
        handler: "processNewsEmbeddingsHandler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/process-news-embeddings.ts"
        ),
        description: "Process news articles and generate embeddings (RAG)",
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        ...globalLambdaConfig,
        // Use CommonJS for Pinecone SDK compatibility
        bundling: {
          format: OutputFormat.CJS,
          sourceMap: true,
          minify: false,
        },
      }
    );

    // S3 event trigger for automatic processing
    processNewsEmbeddings.addEventSource(
      new S3EventSource(mainBucket as s3.Bucket, {
        events: [s3.EventType.OBJECT_CREATED],
        filters: [{ prefix: "news-", suffix: ".json" }],
      })
    );

    processNewsEmbeddings.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "kms:Decrypt"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/ai-content-pipe/pinecone-api-key`,
        ],
      })
    );

    processNewsEmbeddings.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${mainBucket.bucketArn}/*`],
      })
    );

    processNewsEmbeddings.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
        ],
      })
    );

    /**
     * ========================================
     * PHASE 3: Bedrock Agent (MCP/Strands)
     * ========================================
     */

    /**
     * Action Group Lambda: Pinecone Search
     * Simple, focused action handler following Strands principles
     */
    const pineconeSearchAction = new nodeLambda.NodejsFunction(
      this,
      "PineconeSearchAction",
      {
        handler: "handler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/bedrock-agent-actions/pinecone-search.ts"
        ),
        description: "Bedrock Agent action: Search Pinecone vector DB",
        memorySize: 512,
        timeout: cdk.Duration.seconds(60),
        ...globalLambdaConfig,
        // Use CommonJS for Pinecone SDK compatibility
        bundling: {
          format: OutputFormat.CJS,
          sourceMap: true,
          minify: false,
        },
      }
    );

    pineconeSearchAction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "kms:Decrypt"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/ai-content-pipe/pinecone-api-key`,
        ],
      })
    );

    pineconeSearchAction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
        ],
      })
    );

    /**
     * Action Group Lambda: Send Email
     * Simple, focused action handler
     */
    const sendEmailAction = new nodeLambda.NodejsFunction(
      this,
      "SendEmailAction",
      {
        handler: "handler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/bedrock-agent-actions/send-email.ts"
        ),
        description: "Bedrock Agent action: Send email via SES",
        memorySize: 512,
        timeout: cdk.Duration.seconds(60),
        ...globalLambdaConfig,
      }
    );

    sendEmailAction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "kms:Decrypt"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/ai-content-pipe/from-email`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/ai-content-pipe/default-to-email`,
        ],
      })
    );

    sendEmailAction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"], // SES doesn't support resource-level permissions
      })
    );

    /**
     * Bedrock Agent Role
     */
    const agentRole = new iam.Role(this, "BedrockAgentRole", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com", {
        conditions: {
          StringEquals: {
            "aws:SourceAccount": this.account,
          },
          ArnLike: {
            "aws:SourceArn": `arn:aws:bedrock:${this.region}:${this.account}:agent/*`,
          },
        },
      }),
      description: "IAM role for Bedrock Agent with Strands architecture",
    });

    // Foundation model access - Using Amazon Nova Micro (supports tool use, fastest)
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          // Amazon Nova Micro - smallest/fastest model that supports tool use
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-micro-v1:0`,
        ],
      })
    );

    // Action group Lambda invocation
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          pineconeSearchAction.functionArn,
          sendEmailAction.functionArn,
        ],
      })
    );

    /**
     * Bedrock Agent with Enhanced Configuration
     */
    const contentAgent = new bedrock.CfnAgent(this, "ContentAgent", {
      agentName: "ai-content-pipe-agent-strands",
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: "amazon.nova-micro-v1:0", // Nova Micro - fastest response
      description:
        "AI Content Pipeline Agent - AWS Strands Architecture with Amazon Nova Micro",

      // Minimal instruction for testing
      instruction: `You are a helpful assistant. Use the available tools to answer questions.`,

      // Action Groups with OpenAPI-style definitions
      actionGroups: [
        {
          actionGroupName: "search-actions",
          description: "Search and retrieve articles from knowledge base",
          actionGroupExecutor: {
            lambda: pineconeSearchAction.functionArn,
          },
          functionSchema: {
            functions: [
              {
                name: "pinecone_search",
                description:
                  "Search the Pinecone vector database for relevant articles based on semantic similarity. Returns article titles, descriptions, URLs, and relevance scores.",
                parameters: {
                  query: {
                    type: "string",
                    description:
                      "The search query or topic to find relevant articles about. Use natural language descriptions.",
                    required: true,
                  },
                  maxResults: {
                    type: "integer",
                    description:
                      "Maximum number of results to return. Default is 5. Range: 1-20.",
                    required: false,
                  },
                },
              },
            ],
          },
        },
        {
          actionGroupName: "email-actions",
          description: "Send emails via AWS SES",
          actionGroupExecutor: {
            lambda: sendEmailAction.functionArn,
          },
          functionSchema: {
            functions: [
              {
                name: "send_email",
                description:
                  "Send an email newsletter to specified recipients via AWS SES. Supports HTML content with proper formatting.",
                parameters: {
                  recipients: {
                    type: "array",
                    description:
                      "Array of email addresses to send the newsletter to. All addresses must be verified in SES (if in sandbox).",
                    required: true,
                  },
                  subject: {
                    type: "string",
                    description:
                      "Subject line for the email. Keep it concise and engaging (max 100 chars recommended).",
                    required: true,
                  },
                  body: {
                    type: "string",
                    description:
                      "HTML content of the email newsletter. Must be valid HTML with proper structure.",
                    required: true,
                  },
                },
              },
            ],
          },
        },
      ],

      // Enable guardrails for content moderation (optional but recommended)
      // guardrailConfiguration: {
      //   guardrailIdentifier: "your-guardrail-id",
      //   guardrailVersion: "DRAFT"
      // },

      // Prompt override configuration - use DEFAULT mode for simplicity
      // Note: When using DEFAULT mode, don't specify inferenceConfiguration or promptState
      promptOverrideConfiguration: {
        promptConfigurations: [
          {
            promptType: "PRE_PROCESSING",
            promptCreationMode: "DEFAULT",
          },
          {
            promptType: "ORCHESTRATION",
            promptCreationMode: "DEFAULT",
          },
        ],
      },

      // Enable idle session timeout
      idleSessionTtlInSeconds: 600, // 10 minutes
    });

    /**
     * Agent Alias for versioning and deployment
     */
    const agentAlias = new bedrock.CfnAgentAlias(this, "ContentAgentAlias", {
      agentId: contentAgent.attrAgentId,
      agentAliasName: "production",
      description: "Production alias for content generation agent (Strands)",
    });

    /**
     * Custom Resource to automatically prepare agent after deployment
     * This ensures the agent is ready to use immediately after stack updates
     */
    const prepareAgentFunction = new nodeLambda.NodejsFunction(
      this,
      "PrepareAgentFunction",
      {
        handler: "handler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/infra/prepare-agent.ts"
        ),
        description: "Prepare Bedrock Agent after deployment",
        timeout: cdk.Duration.minutes(2),
        ...globalLambdaConfig,
      }
    );

    prepareAgentFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:PrepareAgent", "bedrock:GetAgent"],
        resources: [contentAgent.attrAgentArn],
      })
    );

    const prepareAgentProvider = new cr.Provider(this, "PrepareAgentProvider", {
      onEventHandler: prepareAgentFunction,
      logRetention: logs.RetentionDays.ONE_DAY,
    });

    const prepareAgentResource = new cdk.CustomResource(
      this,
      "PrepareAgentResource",
      {
        serviceToken: prepareAgentProvider.serviceToken,
        properties: {
          AgentId: contentAgent.attrAgentId,
          // Trigger re-preparation on any agent configuration change
          Timestamp: Date.now(),
        },
      }
    );

    // Ensure preparation happens after alias is created
    prepareAgentResource.node.addDependency(agentAlias);

    // Allow Bedrock to invoke action Lambdas
    pineconeSearchAction.addPermission("AllowBedrockInvoke", {
      principal: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceAccount: this.account,
      sourceArn: contentAgent.attrAgentArn,
    });

    sendEmailAction.addPermission("AllowBedrockInvoke", {
      principal: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceAccount: this.account,
      sourceArn: contentAgent.attrAgentArn,
    });

    /**
     * Lambda for Agent Invocation (replaces API Gateway)
     * This Lambda provides a simple wrapper for invoking the agent
     */
    const invokeAgentLambda = new nodeLambda.NodejsFunction(
      this,
      "InvokeAgent",
      {
        handler: "invokeAgentHandler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/invoke-bedrock-agent.ts"
        ),
        description: "Invoke Bedrock Agent (Strands pattern)",
        memorySize: 512,
        timeout: cdk.Duration.minutes(5),
        ...globalLambdaConfig,
        environment: {
          ...globalLambdaConfig.environment,
          AGENT_ID: contentAgent.attrAgentId,
          AGENT_ALIAS_ID: agentAlias.attrAgentAliasId,
        },
      }
    );

    invokeAgentLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeAgent"],
        resources: [
          contentAgent.attrAgentArn,
          `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/${contentAgent.attrAgentId}/*`,
        ],
      })
    );

    // Create Function URL for direct invocation (modern alternative to API Gateway)
    const agentFunctionUrl = invokeAgentLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM, // Use IAM auth for security
      cors: {
        allowedOrigins: ["*"], // Adjust for production
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ["Content-Type", "Authorization"],
      },
    });

    /**
     * ========================================
     * Outputs and Exports
     * ========================================
     */

    new cdk.CfnOutput(this, "AgentId", {
      value: contentAgent.attrAgentId,
      description: "Bedrock Agent ID",
      exportName: "StrandsAgentId",
    });

    new cdk.CfnOutput(this, "AgentAliasId", {
      value: agentAlias.attrAgentAliasId,
      description: "Bedrock Agent Alias ID",
      exportName: "StrandsAgentAliasId",
    });

    new cdk.CfnOutput(this, "AgentInvocationUrl", {
      value: agentFunctionUrl.url,
      description: "Function URL for invoking the agent",
    });

    new cdk.CfnOutput(this, "PineconeActionArn", {
      value: pineconeSearchAction.functionArn,
      description: "Pinecone search action Lambda ARN",
    });

    new cdk.CfnOutput(this, "EmailActionArn", {
      value: sendEmailAction.functionArn,
      description: "Send email action Lambda ARN",
    });

    // Tags for cost allocation and organization
    cdk.Tags.of(this).add("Project", "AIContentPipe");
    cdk.Tags.of(this).add("Architecture", "AWSStrands");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
