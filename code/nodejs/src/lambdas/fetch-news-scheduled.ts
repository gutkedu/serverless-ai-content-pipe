import { getLogger } from '@/shared/logger/get-logger.js'
import { SecretParams } from '@/shared/secrets/secrets-dtos.js'
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

export const fetchNewsScheduledHandler = async (
  event: EventBridgeEvent<'fetch_news_api', unknown>,
  context: Context
) => {
  logger.addContext(context)
  logger.info('Fetch news scheduled event received', { event })

  logger.info('Fetched news API key', { secretsJson })
}
