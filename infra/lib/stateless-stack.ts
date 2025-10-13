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
import { StatefulStackExportsEnum } from "./enums/exports-enum";

/**
 * AI Content Pipeline - Stateless Stack
 *
 * Manual Orchestrator Architecture:
 * - Direct Bedrock API invocation for deterministic workflow
 * - Pinecone vector search for article retrieval
 * - SES email delivery for newsletter distribution
 * - Native AWS observability and X-Ray tracing
 * - Function URL for simple HTTP invocation
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
        POWERTOOLS_SERVICE_NAME: "ai-content-pipe",
        POWERTOOLS_METRICS_NAMESPACE: "AIContentPipe",
        POWERTOOLS_LOG_LEVEL: "INFO",
        MODEL_ID: "us.meta.llama3-3-70b-instruct-v1:0", // Llama 3.3 70B cross-region inference
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
     * PHASE 3: Newsletter Generation (Manual Orchestrator)
     * ========================================
     */

    /**
     * Manual Orchestrator Lambda
     * Workflow: Pinecone search → Bedrock generation → SES email
     * Direct, deterministic, efficient - no agent orchestration
     */
    const generateNewsletterLambda = new nodeLambda.NodejsFunction(
      this,
      "GenerateNewsletter",
      {
        handler: "handler",
        entry: path.join(
          __dirname,
          "../../backend/nodejs/src/lambdas/generate-newsletter.ts"
        ),
        description: "Manual orchestrator: Search, Generate, Send newsletter",
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

    // SSM Parameter access (Pinecone API key)
    generateNewsletterLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "kms:Decrypt"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/ai-content-pipe/pinecone-api-key`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/ai-content-pipe/from-email`,
        ],
      })
    );

    // Bedrock model invocation (Llama 3.3 70B inference profile + underlying model in all regions + Titan Embeddings)
    generateNewsletterLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          // Cross-region inference profile
          `arn:aws:bedrock:us-east-1:${this.account}:inference-profile/us.meta.llama3-3-70b-instruct-v1:0`,
          // Underlying foundation model (can be routed to any region)
          `arn:aws:bedrock:*::foundation-model/meta.llama3-3-70b-instruct-v1:0`,
          // Titan embeddings
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`,
        ],
      })
    );

    // SES email sending
    generateNewsletterLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"], // SES doesn't support resource-level permissions
      })
    );

    // Create Function URL for direct HTTP invocation
    const newsletterFunctionUrl = generateNewsletterLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM, // IAM auth for security
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

    new cdk.CfnOutput(this, "NewsletterGeneratorUrl", {
      value: newsletterFunctionUrl.url,
      description:
        "Function URL for newsletter generation (manual orchestrator)",
    });

    new cdk.CfnOutput(this, "NewsletterLambdaArn", {
      value: generateNewsletterLambda.functionArn,
      description: "Newsletter generator Lambda ARN",
    });

    // Tags for cost allocation and organization
    cdk.Tags.of(this).add("Project", "AIContentPipe");
    cdk.Tags.of(this).add("Architecture", "ManualOrchestrator");
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }
}
