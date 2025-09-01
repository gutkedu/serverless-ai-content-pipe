import { BucketProvider } from '@/providers/bucket/bucket-provider.js'
import { NewsApiProvider } from '@/providers/news-api/news-api-provider.js'
import { getLogger } from '@/shared/logger/get-logger.js'

const logger = getLogger()

export interface FetchNewsUseCaseRequest {
  topic: string
  page: number
  pageSize: number
}

export class FetchNewsUseCase {
  constructor(
    private readonly newsProvider: NewsApiProvider,
    private readonly bucketProvider: BucketProvider
  ) {}

  async execute({
    page,
    pageSize,
    topic
  }: FetchNewsUseCaseRequest): Promise<void> {
    const news = await this.newsProvider.searchNews({
      q: topic,
      page,
      pageSize,
      sortBy: 'relevancy'
    })

    logger.info('Fetched news articles', { news })

    await this.bucketProvider.uploadJson(
      JSON.stringify(news.articles),
      `news-${Date.now()}.json`
    )

    logger.info('Uploaded news articles to bucket')
  }
}
