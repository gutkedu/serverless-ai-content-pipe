import { getLogger } from '@/shared/logger/get-logger.js'
import { SecretParams, SecretsEnums } from '@/shared/secrets/secrets-dtos.js'
import { makeFetchNews } from '@/use-cases/factories/make-fetch-news.js'
import { getSecret } from '@aws-lambda-powertools/parameters/secrets'
import { Context, EventBridgeEvent } from 'aws-lambda'

const logger = getLogger()

const secretsJson: SecretParams = (await getSecret(
  process.env.CONTENT_PIPE_SECRETS_NAME as string,
  {
    transform: 'json',
    maxAge: 300
  }
)) as SecretParams

const useCase = makeFetchNews({
  newsApiKey: secretsJson[SecretsEnums.NEWS_API_KEY]
})

export const fetchNewsScheduledHandler = async (
  event: EventBridgeEvent<'fetch_news_api', unknown>,
  context: Context
) => {
  try {
    logger.addContext(context)
    logger.info('Fetch news scheduled event received', { event })

    await useCase.execute({ topic: 'tech', page: 1, pageSize: 10 })
  } catch (error) {
    logger.error('Error fetching news', { error })
    throw error
  }
}
