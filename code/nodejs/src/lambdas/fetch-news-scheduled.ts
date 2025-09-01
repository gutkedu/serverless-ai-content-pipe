import { getLogger } from '@/shared/logger/get-logger.js'
import { SecretParams, SecretsEnums } from '@/shared/secrets/secrets-dtos.js'
import { makeFetchNews } from '@/use-cases/factories/make-fetch-news.js'
import { getSecret } from '@aws-lambda-powertools/parameters/secrets'
import { Context } from 'aws-lambda'
import { z } from 'zod'

const logger = getLogger()

const schema = z.object({
  topic: z.string().min(2).max(100).default('tech'),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(10)
})

type EventDetail = z.infer<typeof schema>

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
  event: EventDetail,
  context: Context
) => {
  try {
    logger.addContext(context)
    logger.info('Fetch news scheduled event received', { event })

    const { topic, page, pageSize } = schema.parse(event)

    await useCase.execute({ topic, page, pageSize })
  } catch (error) {
    logger.error('Error fetching news', { error })
    throw error
  }
}
