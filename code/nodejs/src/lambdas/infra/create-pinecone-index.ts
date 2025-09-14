import { Pinecone } from '@pinecone-database/pinecone'
import { getParameter } from '@aws-lambda-powertools/parameters/ssm'
import { getLogger } from '@/shared/logger/get-logger.js'
import { Context, Handler } from 'aws-lambda'

const logger = getLogger()

export const createPineconeIndexHandler: Handler = async (
  _event: unknown,
  context: Context
) => {
  try {
    logger.addContext(context)

    const pineconeApiKey = await getParameter(
      process.env.PINECONE_API_KEY_PARAM as string,
      {
        decrypt: true,
        maxAge: 15 * 60 // 15 minutes cache
      }
    )

    if (!pineconeApiKey) {
      logger.error('Pinecone API key not found in SSM Parameter Store')
      throw new Error('Pinecone API key not found in SSM Parameter Store')
    }

    const pinecone = new Pinecone({
      apiKey: pineconeApiKey as string
    })

    const indexName = 'ai-content-pipe'
    const existingIndexes = await pinecone.listIndexes()

    logger.info('Existing indexes:', { indexName, existingIndexes })

    if (existingIndexes.indexes?.some((index) => index.name === indexName)) {
      logger.info(`Index "${indexName}" already exists.`)
      return { status: 'Index already exists' }
    }

    const result = await pinecone.createIndex({
      name: 'ai-content-pipe',
      dimension: 1536, // Adjust for your embedding model
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    })

    logger.info('Pinecone index created successfully:', { result })

    return { status: 'Index created successfully' }
  } catch (error) {
    logger.error('Error creating Pinecone index:', { error })
    throw error
  }
}
