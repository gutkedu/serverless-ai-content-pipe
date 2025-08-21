import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";

export class ServerlessAiContentPipeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the Lambda function using esbuild bundling
    const helloWorld = new nodeLambda.NodejsFunction(
      this,
      "HelloWorldFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler",
        entry: path.join(__dirname, "../code/nodejs/src/hello-world/index.ts"),
        architecture: lambda.Architecture.ARM_64,
        memorySize: 128,
        timeout: cdk.Duration.seconds(30),
        bundling: {
          minify: true,
          sourceMap: true,
          externalModules: ["aws-sdk"],
        },
        environment: {
          POWERTOOLS_SERVICE_NAME: "hello-world",
        },
      }
    );

    // Create the API Gateway
    const api = new apigateway.RestApi(this, "HelloWorldApi", {
      restApiName: "Hello World API",
      description: "Simple API Gateway with Lambda integration",
      deployOptions: {
        stageName: "dev",
      },
      // Enable CORS
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Create an API Gateway resource and method
    const helloWorldIntegration = new apigateway.LambdaIntegration(helloWorld);
    api.root.addMethod("GET", helloWorldIntegration);

    // Output the API Gateway URL
    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway endpoint URL",
    });
  }
}
