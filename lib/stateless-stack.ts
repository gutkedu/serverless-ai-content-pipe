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
        code: lambda.Code.fromAsset("code/nodejs/layers/nodejs-deps"),
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
        CONTENT_PIPE_SECRETS_NAME: cdk.Fn.importValue("ContentPipeSecretsName"),
        BUCKET_NAME: cdk.Fn.importValue("ContentPipeBucketName"),
        EVENT_BUS_NAME: cdk.Fn.importValue("ContentPipeEventBusName"),
        POWERTOOLS_SERVICE_NAME: "ai-content-pipe",
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
          //externalModules: ["aws-sdk"],
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
            "secretsmanager:GetSecretValue",
            "s3:GetObject",
            "s3:ListBucket",
            "s3:PutObject",
          ],
          resources: [
            "arn:aws:secretsmanager:*:*:secret:ContentPipeSecrets*",
            `arn:aws:s3:::${globalLambdaConfigs.environment.BUCKET_NAME}`,
            `arn:aws:s3:::${globalLambdaConfigs.environment.BUCKET_NAME}/*`,
          ],
        })
      );
    }

    new scheduler.CfnSchedule(this, "FetchNewsSchedule", {
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: "rate(1 hour)", // or cron(...)
      target: {
        arn: fetchNewsScheduled.functionArn,
        roleArn: fetchNewsScheduled.role!.roleArn,
        input: JSON.stringify({
          topic: "Artificial Intelligence",
          page: 1,
          pageSize: 10,
        }),
      },
      name: "FetchNewsScheduledEvent",
      description: "Triggers fetch-news-scheduled Lambda",
    });
  }
}
