import { getLogger } from '../logger/get-logger.js'
import { getParameter } from '@aws-lambda-powertools/parameters/ssm'

const logger = getLogger()

export async function fetchPineconeApiKey(): Promise<string> {
  const pineconeApiKey = await getParameter(
    process.env.PINECONE_API_KEY_PARAM as string,
    {
      decrypt: true,
      maxAge: 15 * 60 // 15 minutes cache
    }
  )

  if (!pineconeApiKey) {
    const errorMessage = 'Pinecone API key not found in SSM Parameter Store'
    logger.error(errorMessage)
    throw new Error(errorMessage)
  }

  return pineconeApiKey
}
