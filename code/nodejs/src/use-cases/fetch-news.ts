import { BucketProvider } from '@/providers/bucket/bucket-provider.js'
import { NewsApiProvider } from '@/providers/news-api/news-api-provider.js'
import { NewsArticle } from '@/providers/news-api/news-api-dto.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import { createHash } from 'crypto'

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

    const newArticles = await this.filterNewArticlesWithCache(limitedArticles)

    if (newArticles.length === 0) {
      logger.info(
        'No new articles to process - all articles already processed',
        {
          totalFetched: limitedArticles.length,
          newArticles: 0,
          duplicatesSkipped: limitedArticles.length
        }
      )
      return
    }

    await this.bucketProvider.uploadJson(newArticles, `news-${Date.now()}.json`)

    await this.updateProcessedUrlsCache(newArticles)

    logger.info('Uploaded new articles to bucket', {
      uploadedCount: newArticles.length,
      originalCount: news.articles.length,
      totalFetched: limitedArticles.length,
      duplicatesSkipped: limitedArticles.length - newArticles.length
    })
  }

  private async filterNewArticlesWithCache(
    articles: NewsArticle[]
  ): Promise<NewsArticle[]> {
    const processedUrls = await this.getProcessedUrlsCache()

    const newArticles: NewsArticle[] = []

    for (const article of articles) {
      const urlHash = this.generateUrlHash(article.url)

      if (!processedUrls.has(urlHash)) {
        newArticles.push(article)
        logger.info('New article detected', {
          title: article.title,
          url: article.url,
          urlHash
        })
      } else {
        logger.info('Duplicate article skipped (cached)', {
          title: article.title,
          url: article.url,
          urlHash
        })
      }
    }

    return newArticles
  }

  private async getProcessedUrlsCache(): Promise<Set<string>> {
    try {
      const cacheData = await this.bucketProvider.getObject(
        'processed-urls-cache.json'
      )
      const parsedCache = JSON.parse(cacheData as string) as string[]
      return new Set(parsedCache)
    } catch (error) {
      logger.info('Processed URLs cache not found, starting fresh', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return new Set<string>()
    }
  }

  private async updateProcessedUrlsCache(
    articles: NewsArticle[]
  ): Promise<void> {
    try {
      const processedUrls = await this.getProcessedUrlsCache()

      articles.forEach((article) => {
        const urlHash = this.generateUrlHash(article.url)
        processedUrls.add(urlHash)
      })

      const urlArray = Array.from(processedUrls)
      const limitedUrls = urlArray.slice(-10000)

      await this.bucketProvider.uploadJson(
        limitedUrls,
        'processed-urls-cache.json'
      )

      logger.info('Updated processed URLs cache', {
        newUrlsAdded: articles.length,
        totalCachedUrls: limitedUrls.length
      })
    } catch (error) {
      logger.error('Failed to update processed URLs cache', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private generateUrlHash(url: string): string {
    return createHash('sha256').update(url).digest('hex').substring(0, 16)
  }
}
