# Serverless AI Content Pipeline 🤖📰

A fully serverless AI-powered content pipeline that automatically fetches news articles, processes them into vector embeddings, and generates personalized newsletters using AWS Bedrock and Pinecone.

## 🎯 Overview

This project implements a complete RAG (Retrieval-Augmented Generation) pipeline with three main workflows:

1. **News Fetching** - Scheduled collection of news articles from NewsAPI
2. **Embeddings Processing** - Automatic vectorization and storage in Pinecone
3. **Newsletter Generation** - AI-powered newsletter creation and email delivery

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Serverless AI Pipeline                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Fetch News   │    │  Process     │    │  Generate    │  │
│  │   Lambda     │───▶│  Embeddings  │    │ Newsletter   │  │
│  │ (Scheduled)  │    │   Lambda     │    │   Lambda     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   S3 Bucket  │    │   Pinecone   │    │   AWS SES    │  │
│  │  (Raw Data)  │    │  (Vectors)   │    │   (Email)    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Features

- **Automated News Collection**: Scheduled fetching from NewsAPI every hour
- **Vector Search**: Semantic search powered by Pinecone vector database
- **AI Content Generation**: Newsletter creation using AWS Bedrock (Llama 3.3 70B)
- **Email Delivery**: Automated sending via AWS SES
- **Clean Architecture**: Use case pattern with dependency injection
- **Infrastructure as Code**: AWS CDK for complete infrastructure management
- **Serverless**: Zero server management, pay-per-use pricing

## 📋 Prerequisites

- **Node.js** 22.x or later
- **AWS Account** with appropriate permissions
- **AWS CLI** configured with credentials
- **Pinecone Account** and API key
- **NewsAPI Key**

### AWS Services Required

- Lambda (Node.js 22 runtime)
- S3 (for raw data storage)
- EventBridge (for scheduling)
- SES (for email delivery)
- Bedrock (for AI models)
- SSM Parameter Store (for secrets)

## 🛠️ Setup

### 1. Clone the Repository

```bash
git clone https://github.com/gutkedu/serverless-ai-content-pipe.git
cd serverless-ai-content-pipe
```

### 2. Install Dependencies

```bash
# Install backend dependencies
cd backend/nodejs
npm install

# Install infrastructure dependencies
cd ../../infra
npm install
```

### 3. Configure AWS Parameters

Store your secrets in AWS Systems Manager Parameter Store:

```bash
# Pinecone API Key
aws ssm put-parameter \
  --name "/ai-content-pipe/pinecone-api-key" \
  --value "your-pinecone-api-key" \
  --type "SecureString" \
  --profile your-aws-profile

# NewsAPI Key
aws ssm put-parameter \
  --name "/ai-content-pipe/news-api-key" \
  --value "your-news-api-key" \
  --type "SecureString" \
  --profile your-aws-profile

# From Email (must be verified in SES)
aws ssm put-parameter \
  --name "/ai-content-pipe/from-email" \
  --value "your-verified-email@example.com" \
  --type "String" \
  --profile your-aws-profile
```

### 4. Verify Email in SES

If you're in SES sandbox mode, verify your sender email:

```bash
aws ses verify-email-identity \
  --email-address your-email@example.com \
  --region us-east-1 \
  --profile your-aws-profile
```

### 5. Create Pinecone Index

Create an index named `ai-content-pipe` with:
- **Dimensions**: 1536 (for Amazon Titan Embeddings v1)
- **Metric**: Cosine similarity

Or use the infrastructure Lambda to create it automatically.

## 🚢 Deployment

### Deploy Infrastructure

```bash
cd infra

# Build the project
npm run build

# Deploy stateful resources (S3, Lambda layers)
cdk deploy AiContentPipeStatefulStack --profile your-aws-profile

# Deploy stateless resources (Lambdas, EventBridge)
cdk deploy AiContentPipeStatelessStack --profile your-aws-profile
```

### Deploy All at Once

```bash
cdk deploy --all --profile your-aws-profile
```

## 📖 Usage

### Fetch News (Automated)

Runs automatically every hour via EventBridge. To trigger manually:

```bash
aws lambda invoke \
  --function-name FetchNewsScheduledLambda \
  --region us-east-1 \
  --profile your-aws-profile \
  response.json
```

### Process Embeddings (Automated)

Triggered automatically when new files are added to S3. To trigger manually:

```bash
aws lambda invoke \
  --function-name ProcessNewsEmbeddingsLambda \
  --payload '{"Records":[{"s3":{"bucket":{"name":"your-bucket"},"object":{"key":"news-data/file.json"}}}]}' \
  --region us-east-1 \
  --profile your-aws-profile \
  response.json
```

### Generate Newsletter

Use the Function URL or invoke directly:

```bash
curl -X POST "https://your-function-url.lambda-url.us-east-1.on.aws/" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "artificial intelligence",
    "recipients": ["recipient@example.com"],
    "maxArticles": 5
  }'
```

Or via AWS CLI:

```bash
aws lambda invoke \
  --function-name GenerateNewsletterLambda \
  --payload '{
    "topic": "technology trends",
    "recipients": ["your-email@example.com"],
    "maxArticles": 10
  }' \
  --region us-east-1 \
  --profile your-aws-profile \
  response.json
```

## 🏗️ Project Structure

```
serverless-ai-content-pipe/
├── backend/nodejs/          # Lambda functions and business logic
│   ├── src/
│   │   ├── lambdas/        # Lambda handlers
│   │   │   ├── fetch-news-scheduled.ts
│   │   │   ├── process-news-embeddings.ts
│   │   │   └── generate-newsletter.ts
│   │   ├── use-cases/      # Business logic layer
│   │   │   ├── fetch-news.ts
│   │   │   ├── process-news-embeddings.ts
│   │   │   ├── generate-newsletter.ts
│   │   │   └── factories/  # Dependency injection
│   │   ├── providers/      # External service abstractions
│   │   │   ├── ai/         # Bedrock provider
│   │   │   ├── bucket/     # S3 provider
│   │   │   ├── email/      # SES provider
│   │   │   └── news-api/   # NewsAPI provider
│   │   ├── repositories/   # Data access layer
│   │   │   └── pinecone/   # Pinecone vector repository
│   │   └── shared/         # Utilities and helpers
│   └── layers/             # Lambda layers (dependencies)
├── infra/                  # AWS CDK infrastructure
│   ├── bin/                # CDK app entry point
│   ├── lib/                # Stack definitions
│   │   ├── stateful-stack.ts
│   │   └── stateless-stack.ts
│   └── cdk.json           # CDK configuration
└── docs/                   # Documentation
```

## 🔧 Configuration

### Environment Variables

Lambdas use the following environment variables:

- `MODEL_ID`: Bedrock model ID (default: `us.meta.llama3-3-70b-instruct-v1:0`)
- `PINECONE_INDEX`: Pinecone index name (default: `ai-content-pipe`)
- `NEWS_BUCKET_NAME`: S3 bucket for raw news data

### Models Used

- **Embeddings**: Amazon Titan Text Embeddings v1 (1536 dimensions)
- **Generation**: Meta Llama 3.3 70B Instruct (cross-region inference profile)

## 🧪 Testing

### Run TypeScript Build

```bash
cd backend/nodejs
npm run build
```

### Check for Errors

```bash
npm run lint
```

### CloudWatch Metrics

Monitor in AWS Console:
- Lambda invocations and errors
- S3 object counts
- SES email delivery rates
- Bedrock API usage

## 💡 Key Concepts

### Clean Architecture

The project follows a clean architecture pattern:

```
Handler → Factory → Use Case → Providers/Repositories
```

- **Handlers**: Thin Lambda entry points
- **Factories**: Dependency injection for use cases
- **Use Cases**: Business logic orchestration
- **Providers**: External service abstractions (Bedrock, SES, S3, NewsAPI)
- **Repositories**: Data access (Pinecone)

### RAG Pipeline

1. **Ingestion**: News articles fetched and stored in S3
2. **Processing**: Articles converted to embeddings via Titan
3. **Storage**: Vectors stored in Pinecone with metadata
4. **Retrieval**: Semantic search finds relevant articles
5. **Generation**: Bedrock generates newsletter content
6. **Delivery**: SES sends formatted emails

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- AWS Bedrock for AI capabilities
- Pinecone for vector database
- NewsAPI for news content
- AWS CDK for infrastructure as code