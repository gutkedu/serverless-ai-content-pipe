import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import { OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";

export class AiContentPipeStatelessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    const fetchNewsScheduled = new nodeLambda.NodejsFunction(
      this,
      "FetchNewsScheduledFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        layers: [
          nodejsDepsLambdaLayer,
          lambda.LayerVersion.fromLayerVersionArn(
            this,
            "PowertoolsTypeScriptLayer",
            "arn:aws:lambda:us-east-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:34"
          ),
        ],
        handler: "fetchNewsScheduledHandler",
        entry: path.join(
          __dirname,
          "../code/nodejs/src/lambdas/fetch-news-scheduled.ts"
        ),
        architecture: lambda.Architecture.ARM_64,
        memorySize: 128,
        timeout: cdk.Duration.seconds(30),
        bundling: {
          minify: true,
          sourceMap: true,
          //externalModules: ["aws-sdk"],
          format: OutputFormat.ESM,
        },
        environment: {
          POWERTOOLS_SERVICE_NAME: "fetch-news-scheduled",
          CONTENT_PIPE_SECRETS_NAME: cdk.Fn.importValue(
            "ContentPipeSecretsName"
          ),
        },
      }
    );
    // Grant permission to read ContentPipeSecrets from Secrets Manager
    fetchNewsScheduled.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: ["arn:aws:secretsmanager:*:*:secret:ContentPipeSecrets*"],
      })
    );
  }
}
