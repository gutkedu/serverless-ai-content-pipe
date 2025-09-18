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
        code: lambda.Code.fromAsset("code/nodejs/layers/deps"),
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
          "../code/nodejs/src/lambdas/fetch-news-scheduled.ts"
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
          "../code/nodejs/src/lambdas/infra/create-pinecone-index.ts"
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
          "../code/nodejs/src/lambdas/process-news-embeddings.ts"
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

    const generateContentAgent = new nodeLambda.NodejsFunction(
      this,
      "GenerateContentAgentFunction",
      {
        handler: "generateContentAgentHandler",
        entry: path.join(
          __dirname,
          "../code/nodejs/src/lambdas/generate-content-agent.ts"
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
  }
}
