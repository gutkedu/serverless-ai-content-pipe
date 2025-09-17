import { getLogger } from '@/shared/logger/get-logger.js'
import { makeFetchNews } from '@/use-cases/factories/make-fetch-news.js'
import { getParameter } from '@aws-lambda-powertools/parameters/ssm'
import { Context } from 'aws-lambda'
import { z } from 'zod'

const logger = getLogger()

const schema = z.object({
  topic: z.string().min(2).max(100).default('Artificial Intelligence'),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(10)
})

const newsApiKey = await getParameter(
  process.env.NEWS_API_KEY_PARAM as string,
  {
    decrypt: true,
    maxAge: 15 * 60 // 15 minutes cache
  }
)

const useCase = makeFetchNews({
  newsApiKey: newsApiKey as string
})

type EventDetail = z.infer<typeof schema>

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
