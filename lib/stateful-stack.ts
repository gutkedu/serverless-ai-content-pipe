import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { StatefulStackExportsEnum } from "./enums/exports-enum";

export class AiContentPipeStatefulStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const eventBus = new cdk.aws_events.EventBus(this, "ContentPipeEventBus", {
      eventBusName: "ContentPipeEventBus",
    });

    new cdk.CfnOutput(this, "EventBusName", {
      value: eventBus.eventBusName,
      description: "Event bus name",
      exportName: StatefulStackExportsEnum.EVENT_BUS,
    });

    const bucket = new s3.Bucket(this, "ContentPipeBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Not for production!
      autoDeleteObjects: true, // Not for production!
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket name",
      exportName: StatefulStackExportsEnum.MAIN_BUCKET,
    });

    const newsApiKeyParam = new ssm.StringParameter(this, "NewsApiKeyParam", {
      parameterName: "/ai-content-pipe/news-api-key",
      stringValue: "replace-with-your-news-api-key",
      description: "News API key for fetching articles",
    });

    const pineconeApiKeyParam = new ssm.StringParameter(
      this,
      "PineconeApiKeyParam",
      {
        parameterName: "/ai-content-pipe/pinecone-api-key",
        stringValue: "your-pinecone-api-key-here", // Replace with actual key
        description: "Pinecone API key for vector database",
      }
    );

    new cdk.CfnOutput(this, "NewsApiKeyParamName", {
      value: newsApiKeyParam.parameterName,
      exportName: StatefulStackExportsEnum.NEWS_API_KEY_PARAM,
      description: "SSM Parameter name for News API key",
    });

    new cdk.CfnOutput(this, "PineconeApiKeyParamName", {
      value: pineconeApiKeyParam.parameterName,
      exportName: StatefulStackExportsEnum.PINECONE_API_KEY_PARAM,
      description: "SSM Parameter name for Pinecone API key",
    });

    // SES Configuration - SSM Parameters
    const fromEmailParam = new ssm.StringParameter(this, "FromEmailParam", {
      parameterName: "/ai-content-pipe/from-email",
      stringValue: "noreply@yourdomain.com", // Replace with your verified email
      description: "From email address for SES (must be verified in SES)",
    });

    const defaultToEmailParam = new ssm.StringParameter(
      this,
      "DefaultToEmailParam",
      {
        parameterName: "/ai-content-pipe/default-to-email",
        stringValue: "your-email@example.com", // Replace with default recipient
        description: "Default recipient email address",
      }
    );

    new cdk.CfnOutput(this, "FromEmailParamName", {
      value: fromEmailParam.parameterName,
      exportName: StatefulStackExportsEnum.FROM_EMAIL_PARAM,
      description: "SSM Parameter name for From Email",
    });

    new cdk.CfnOutput(this, "DefaultToEmailParamName", {
      value: defaultToEmailParam.parameterName,
      exportName: StatefulStackExportsEnum.DEFAULT_TO_EMAIL_PARAM,
      description: "SSM Parameter name for Default To Email",
    });
  }
}
