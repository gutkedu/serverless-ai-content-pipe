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
    logger.info('Requesting news with parameters', {
      topic,
      page,
      pageSize
    })

    const news = await this.newsProvider.searchNews({
      q: topic,
      page,
      pageSize,
      sortBy: 'relevancy'
    })

    logger.info('Fetched news articles', {
      requestedPageSize: pageSize,
      actualArticleCount: news.articles.length,
      totalResults: news.totalResults,
      status: news.status
    })

    const limitedArticles = news.articles.slice(0, pageSize)

    await this.bucketProvider.uploadJson(
      limitedArticles,
      `news-${Date.now()}.json`
    )

    logger.info('Uploaded news articles to bucket', {
      uploadedCount: limitedArticles.length,
      originalCount: news.articles.length
    })
  }
}
