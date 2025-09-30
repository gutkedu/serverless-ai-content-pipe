import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import { OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import { StatefulStackExportsEnum } from "./enums/exports-enum";

export class AiContentPipeStatelessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Lambda Layers
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

    /**
     * Global Lambda configurations
     */
    const globalLambdaConfigs = {
      environment: {
        NEWS_API_KEY_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.NEWS_API_KEY_PARAM
        ),
        PINECONE_API_KEY_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.PINECONE_API_KEY_PARAM
        ),
        BUCKET_NAME: cdk.Fn.importValue(StatefulStackExportsEnum.MAIN_BUCKET),
        EVENT_BUS_NAME: cdk.Fn.importValue(StatefulStackExportsEnum.EVENT_BUS),
        FROM_EMAIL_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.FROM_EMAIL_PARAM
        ),
        DEFAULT_TO_EMAIL_PARAM: cdk.Fn.importValue(
          StatefulStackExportsEnum.DEFAULT_TO_EMAIL_PARAM
        ),
        POWERTOOLS_SERVICE_NAME: "ai-content-pipe",
        BEDROCK_MODEL_ID: "amazon.nova-micro-v1:0",
      },
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      layers: [
        nodejsDepsLambdaLayer,
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "PowertoolsTypeScriptLayer",
          "arn:aws:lambda:us-east-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:34"
        ),
      ],
    };

    /**
     * LAMBDAS
     */

    const fetchNewsScheduled = new nodeLambda.NodejsFunction(
      this,
      "FetchNewsScheduledFunction",
      {
        handler: "fetchNewsScheduledHandler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/fetch-news-scheduled.ts"
        ),
        ...globalLambdaConfigs,
        bundling: {
          minify: true,
          sourceMap: true,
          format: OutputFormat.ESM,
        },
      }
    );

    if (fetchNewsScheduled.role) {
      (fetchNewsScheduled.role as iam.Role).assumeRolePolicy?.addStatements(
        new iam.PolicyStatement({
          principals: [new iam.ServicePrincipal("scheduler.amazonaws.com")],
          actions: ["sts:AssumeRole"],
        })
      );
      fetchNewsScheduled.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            "ssm:GetParameter",
            "kms:Decrypt",
            "s3:GetObject",
            "s3:ListBucket",
            "s3:PutObject",
          ],
          resources: [
            "arn:aws:ssm:*:*:parameter/ai-content-pipe/news-api-key",
            "arn:aws:kms:*:*:key/*",
            `arn:aws:s3:::${globalLambdaConfigs.environment.BUCKET_NAME}`,
            `arn:aws:s3:::${globalLambdaConfigs.environment.BUCKET_NAME}/*`,
          ],
        })
      );
    }

    const createPineconeIndex = new nodeLambda.NodejsFunction(
      this,
      "CreatePineconeIndexFunction",
      {
        handler: "createPineconeIndexHandler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/infra/create-pinecone-index.ts"
        ),
        ...globalLambdaConfigs,
        environment: {
          ...globalLambdaConfigs.environment,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          format: OutputFormat.CJS,
          externalModules: ["@pinecone-database/pinecone"],
        },
      }
    );

    if (createPineconeIndex.role) {
      createPineconeIndex.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter", "kms:Decrypt"],
          resources: [
            "arn:aws:ssm:*:*:parameter/ai-content-pipe/pinecone-api-key",
            "arn:aws:kms:*:*:key/*",
          ],
        })
      );
    }

    const processNewsEmbeddings = new nodeLambda.NodejsFunction(
      this,
      "ProcessNewsEmbeddingsFunction",
      {
        handler: "processNewsEmbeddingsHandler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/process-news-embeddings.ts"
        ),
        events: [], // refer below
        ...globalLambdaConfigs,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        environment: {
          ...globalLambdaConfigs.environment,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          format: OutputFormat.CJS,
          externalModules: ["@pinecone-database/pinecone", "zod"],
        },
      }
    );

    // Add S3 event source to trigger the Lambda
    const mainBucket = s3.Bucket.fromBucketName(
      this,
      "MainBucket",
      cdk.Fn.importValue(StatefulStackExportsEnum.MAIN_BUCKET)
    );

    processNewsEmbeddings.addEventSource(
      new S3EventSource(mainBucket as s3.Bucket, {
        events: [s3.EventType.OBJECT_CREATED],
        filters: [
          {
            prefix: "news-",
            suffix: ".json",
          },
        ],
      })
    );

    if (processNewsEmbeddings.role) {
      processNewsEmbeddings.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter", "kms:Decrypt", "s3:GetObject"],
          resources: [
            "arn:aws:ssm:*:*:parameter/ai-content-pipe/pinecone-api-key",
            "arn:aws:kms:*:*:key/*",
            `arn:aws:s3:::${globalLambdaConfigs.environment.BUCKET_NAME}/*`,
          ],
        })
      );

      // Bedrock permissions - separate policy for clarity
      processNewsEmbeddings.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:GetFoundationModel",
            "bedrock:ListFoundationModels",
          ],
          resources: [
            "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1",
            "arn:aws:bedrock:us-east-1::foundation-model/*", // Allow other models if needed
          ],
        })
      );
    }

    /**
     * Bedrock Agent Action Group Lambdas
     */

    // Pinecone search action Lambda
    const pineconeActionLambda = new nodeLambda.NodejsFunction(
      this,
      "BedrockAgentPineconeActionFunction",
      {
        handler: "handler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/bedrock-agent-actions/pinecone-search.ts"
        ),
        runtime: globalLambdaConfigs.runtime,
        architecture: globalLambdaConfigs.architecture,
        memorySize: 512,
        timeout: cdk.Duration.minutes(2),
        environment: {
          ...globalLambdaConfigs.environment,
          // Pinecone API key will be retrieved from SSM in Lambda code
        },
        bundling: {
          minify: true,
          sourceMap: true,
          format: OutputFormat.CJS,
        },
      }
    );

    // Email action Lambda
    const emailActionLambda = new nodeLambda.NodejsFunction(
      this,
      "BedrockAgentEmailActionFunction",
      {
        handler: "handler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/bedrock-agent-actions/send-email.ts"
        ),
        runtime: globalLambdaConfigs.runtime,
        architecture: globalLambdaConfigs.architecture,
        memorySize: 512,
        timeout: cdk.Duration.minutes(2),
        environment: {
          ...globalLambdaConfigs.environment,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          format: OutputFormat.CJS,
        },
      }
    );

    // Permissions for Pinecone action Lambda
    if (pineconeActionLambda.role) {
      pineconeActionLambda.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter", "kms:Decrypt"],
          resources: [
            "arn:aws:ssm:*:*:parameter/ai-content-pipe/pinecone-api-key",
          ],
        })
      );

      pineconeActionLambda.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["bedrock:InvokeModel"],
          resources: [
            "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1",
          ],
        })
      );
    }

    // Permissions for Email action Lambda
    if (emailActionLambda.role) {
      emailActionLambda.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        })
      );
    }

    const generateContentAgent = new nodeLambda.NodejsFunction(
      this,
      "GenerateContentAgentFunction",
      {
        handler: "generateContentAgentHandler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/generate-content-agent.ts"
        ),
        runtime: globalLambdaConfigs.runtime,
        architecture: globalLambdaConfigs.architecture,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        layers: [
          // Only PowerTools layer - bundle all other dependencies
          lambda.LayerVersion.fromLayerVersionArn(
            this,
            "PowertoolsTypeScriptLayerForContentAgent",
            "arn:aws:lambda:us-east-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:34"
          ),
        ],
        environment: {
          ...globalLambdaConfigs.environment,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          format: OutputFormat.CJS,
          // Bundle everything - don't use external modules for this Lambda
        },
      }
    );

    if (generateContentAgent.role) {
      // SSM and SES permissions
      generateContentAgent.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            "ssm:GetParameter",
            "kms:Decrypt",
            "ses:SendEmail",
            "ses:SendRawEmail",
          ],
          resources: [
            "arn:aws:ssm:*:*:parameter/ai-content-pipe/pinecone-api-key",
            "arn:aws:ssm:*:*:parameter/ai-content-pipe/from-email",
            "arn:aws:ssm:*:*:parameter/ai-content-pipe/default-to-email",
            "arn:aws:kms:*:*:key/*",
            "arn:aws:ses:*:*:identity/*",
          ],
        })
      );

      // Bedrock permissions for content generation
      generateContentAgent.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            "bedrock:InvokeModel",
            "bedrock:GetFoundationModel",
            "bedrock:ListFoundationModels",
          ],
          resources: [
            "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0",
            "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1",
            "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
            "arn:aws:bedrock:us-east-1::foundation-model/*", // Allow other foundational models
          ],
        })
      );
    }

    /**
     * EventBridge Scheduler for Fetch News Lambda
     */
    // Create a dedicated role for EventBridge Scheduler
    const schedulerRole = new iam.Role(this, "SchedulerExecutionRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
      description: "Role for EventBridge Scheduler to invoke Lambda",
    });

    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [fetchNewsScheduled.functionArn],
      })
    );

    const fetchNewsSchedule = new scheduler.CfnSchedule(
      this,
      "FetchNewsSchedule",
      {
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
        name: "FetchNewsScheduledEvent",
        description: "Triggers fetch-news-scheduled",
        state: "ENABLED",
      }
    );

    /**
     * API Gateway for Content Generation Agent
     */
    const contentApiGateway = new apigateway.RestApi(
      this,
      "ContentGenerationApi",
      {
        restApiName: "AI Content Pipe - Content Generation API",
        description:
          "API for triggering content generation and email distribution",
        defaultCorsPreflightOptions: {
          allowOrigins: apigateway.Cors.ALL_ORIGINS,
          allowMethods: apigateway.Cors.ALL_METHODS,
          allowHeaders: ["Content-Type", "Authorization"],
        },
      }
    );

    const generateContentIntegration = new apigateway.LambdaIntegration(
      generateContentAgent,
      {
        proxy: true, // Enable Lambda proxy integration (recommended)
        allowTestInvoke: true, // Allow testing from AWS Console
      }
    );

    const generateContentResource =
      contentApiGateway.root.addResource("generate-content");
    generateContentResource.addMethod("POST", generateContentIntegration);

    new cdk.CfnOutput(this, "ContentGenerationApiUrl", {
      value: contentApiGateway.url,
      description: "API Gateway endpoint URL for content generation",
    });

    // Allow Bedrock Agent to invoke the Lambda functions
    pineconeActionLambda.addPermission("BedrockAgentInvokePineconeAction", {
      principal: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceAccount: this.account,
    });

    emailActionLambda.addPermission("BedrockAgentInvokeEmailAction", {
      principal: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceAccount: this.account,
    });

    /**
     * Bedrock Agent for Content Generation
     */

    // IAM Role for Bedrock Agent
    const agentRole = new iam.Role(this, "ContentGenerationAgentRole", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      description: "Role for Bedrock Agent to access required services",
    });

    // Permissions for Bedrock Agent
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:GetFoundationModel"],
        resources: [
          "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0",
          "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1",
        ],
      })
    );

    // S3 access for agent (if needed for knowledge base)
    const agentBucket = s3.Bucket.fromBucketName(
      this,
      "MainBucketForAgent",
      cdk.Fn.importValue(StatefulStackExportsEnum.MAIN_BUCKET)
    );

    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        resources: [agentBucket.bucketArn, `${agentBucket.bucketArn}/*`],
      })
    );

    // Lambda invocation permissions for action groups
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          pineconeActionLambda.functionArn,
          emailActionLambda.functionArn,
        ],
      })
    );

    // Create the Bedrock Agent
    const contentAgent = new bedrock.CfnAgent(this, "ContentGenerationAgent", {
      agentName: "ai-content-pipe-agent",
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: "amazon.nova-micro-v1:0",
      description: "Agent for generating and sending AI content newsletters",
      instruction: `You are a content generation agent for an AI newsletter system.

Your capabilities:
1. Search for relevant articles using Pinecone vector database
2. Generate newsletter content based on search results  
3. Send newsletters via AWS SES

When asked to create content:
1. First, search for articles related to the topic using the pinecone_search tool
2. Analyze the search results and create engaging newsletter content
3. Send the newsletter to the specified recipients using the send_email tool

Always be helpful, accurate, and create high-quality content that provides value to readers.`,

      actionGroups: [
        {
          actionGroupName: "pinecone-actions",
          description: "Actions for searching articles in Pinecone",
          actionGroupExecutor: {
            lambda: pineconeActionLambda.functionArn,
          },
          functionSchema: {
            functions: [
              {
                name: "pinecone_search",
                description:
                  "Search for relevant articles in Pinecone vector database",
                parameters: {
                  query: {
                    type: "string",
                    description: "Search query for finding relevant articles",
                    required: true,
                  },
                  maxResults: {
                    type: "integer",
                    description:
                      "Maximum number of results to return (default: 5)",
                    required: false,
                  },
                },
              },
            ],
          },
        },
        {
          actionGroupName: "email-actions",
          description: "Actions for sending emails via SES",
          actionGroupExecutor: {
            lambda: emailActionLambda.functionArn,
          },
          functionSchema: {
            functions: [
              {
                name: "send_email",
                description:
                  "Send email newsletter to specified recipients via AWS SES",
                parameters: {
                  recipients: {
                    type: "array",
                    description:
                      "Array of email addresses to send the newsletter to",
                    required: true,
                  },
                  subject: {
                    type: "string",
                    description: "Subject line for the email newsletter",
                    required: true,
                  },
                  body: {
                    type: "string",
                    description: "HTML content of the email newsletter",
                    required: true,
                  },
                },
              },
            ],
          },
        },
      ],
    });

    // Create Agent Alias
    const agentAlias = new bedrock.CfnAgentAlias(this, "ContentAgentAlias", {
      agentId: contentAgent.attrAgentId,
      agentAliasName: "prod",
      description: "Production alias for content generation agent",
    });

    // Export Lambda ARNs for Bedrock Agent (keeping for any existing references)
    new cdk.CfnOutput(this, "PineconeActionLambdaArn", {
      value: pineconeActionLambda.functionArn,
      description: "ARN of Pinecone action Lambda for Bedrock Agent",
      exportName: "PineconeActionLambdaArn",
    });

    new cdk.CfnOutput(this, "EmailActionLambdaArn", {
      value: emailActionLambda.functionArn,
      description: "ARN of Email action Lambda for Bedrock Agent",
      exportName: "EmailActionLambdaArn",
    });

    // Export Agent details
    new cdk.CfnOutput(this, "BedrockAgentId", {
      value: contentAgent.attrAgentId,
      exportName: StatefulStackExportsEnum.BEDROCK_AGENT_ID,
      description: "Bedrock Agent ID for content generation",
    });

    new cdk.CfnOutput(this, "BedrockAgentAliasId", {
      value: agentAlias.attrAgentAliasId,
      exportName: StatefulStackExportsEnum.BEDROCK_AGENT_ALIAS_ID,
      description: "Bedrock Agent Alias ID",
    });
  }
}
