import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3"; // <-- Add this import

export class AiContentPipeStatefulStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "ContentPipeBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Not for production!
      autoDeleteObjects: true, // Not for production!
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket name",
    });
  }
}
