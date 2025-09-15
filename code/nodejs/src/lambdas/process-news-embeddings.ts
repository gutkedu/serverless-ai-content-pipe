import { getLogger } from '@/shared/logger/get-logger.js'
import { S3Handler } from 'aws-lambda'
import { getParameter } from '@aws-lambda-powertools/parameters/ssm'
import { makeProcessNewsEmbeddings } from '@/use-cases/factories/make-process-news-embeddings.js'

const logger = getLogger()

const useCase = makeProcessNewsEmbeddings()

export const processNewsRagHandler: S3Handler = async (event, context) => {
  try {
    logger.addContext(context)
    logger.info('Processing news for RAG', {
      recordCount: event.Records.length,
      requestId: context.awsRequestId
    })

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

    const results = []
    for (let i = 0; i < event.Records.length; i++) {
      const record = event.Records[i]
      const bucket = record.s3.bucket.name
      const key = record.s3.object.key

      try {
        logger.info('Processing S3 record', {
          index: i + 1,
          total: event.Records.length,
          bucket,
          key
        })

        await useCase.execute({
          objectKey: key,
          pineconeApiKey
        })

        logger.info('Successfully processed S3 record', { bucket, key })
        results.push({ success: true, bucket, key })
      } catch (recordError) {
        logger.error('Failed to process S3 record', {
          bucket,
          key,
          error: recordError,
          errorMessage:
            recordError instanceof Error ? recordError.message : 'Unknown error'
        })

        results.push({
          success: false,
          bucket,
          key,
          error:
            recordError instanceof Error ? recordError.message : 'Unknown error'
        })

        continue
      }
    }

    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    logger.info('RAG processing completed', {
      total: results.length,
      successful,
      failed,
      results
    })

    if (failed === results.length && results.length > 0) {
      throw new Error(`All ${failed} records failed to process`)
    }
  } catch (globalError) {
    logger.error('Global error in RAG processing', {
      error: globalError,
      errorMessage:
        globalError instanceof Error
          ? globalError.message
          : 'Unknown global error',
      requestId: context.awsRequestId
    })
    throw globalError
  }
}
