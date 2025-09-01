import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class AiContentPipeStatefulStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const eventBus = new cdk.aws_events.EventBus(this, "ContentPipeEventBus", {
      eventBusName: "ContentPipeEventBus",
    });

    new cdk.CfnOutput(this, "EventBusName", {
      value: eventBus.eventBusName,
      description: "Event bus name",
      exportName: "ContentPipeEventBusName",
    });

    const bucket = new s3.Bucket(this, "ContentPipeBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Not for production!
      autoDeleteObjects: true, // Not for production!
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket name",
      exportName: "ContentPipeBucketName",
    });

    const multiSecret = new secretsmanager.Secret(this, "ContentPipeSecrets", {
      description: "A secret containing multiple values as JSON",
      secretObjectValue: {
        newsApiKey: cdk.SecretValue.unsafePlainText("your-api-key"),
        // Add more keys as needed
      },
    });

    new cdk.CfnOutput(this, "MultiSecretArn", {
      value: multiSecret.secretArn,
      description: "ARN for multi-value secret",
    });

    new cdk.CfnOutput(this, "MultiSecretName", {
      value: multiSecret.secretName,
      exportName: "ContentPipeSecretsName",
      description: "Name for multi-value secret",
    });
  }
}
