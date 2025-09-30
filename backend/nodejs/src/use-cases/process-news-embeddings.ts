import { AIProvider } from '@/providers/ai/ai-provider.js'
import { BucketProvider } from '@/providers/bucket/bucket-provider.js'
import { NewsArticle } from '@/providers/news-api/news-api-dto.js'
import { VectorRecord } from '@/repositories/types/vector-repository-dto.js'
import { VectorRepository } from '@/repositories/vector-repository.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import { createHash } from 'crypto'

const logger = getLogger()

export interface ProcessNewsEmbeddingsRequest {
  objectKey: string
}

export class ProcessNewsEmbeddingsUseCase {
  constructor(
    private readonly aiProvider: AIProvider,
    private readonly bucketProvider: BucketProvider,
    private readonly vectorRepository: VectorRepository
  ) {}

  async execute({ objectKey }: ProcessNewsEmbeddingsRequest): Promise<void> {
    const newsJson = await this.bucketProvider.getObject(objectKey)

    const parsedData = this.validateS3Data(newsJson)

    const allArticles: NewsArticle[] = parsedData as NewsArticle[]

    const MAX_ARTICLES = 50
    const articles = allArticles.slice(0, MAX_ARTICLES)

    logger.info('Processing articles for embeddings', {
      totalArticles: allArticles.length,
      processingCount: articles.length,
      skipped: allArticles.length - articles.length
    })

    const vectors = await this.processArticlesConcurrently(
      articles,
      objectKey,
      2
    )

    if (vectors.length === 0) {
      throw new Error('No articles were successfully processed for embeddings')
    }

    await this.vectorRepository.upsert(vectors)

    logger.info('All articles stored in vector database', {
      processedCount: vectors.length,
      totalArticles: articles.length,
      successRate: `${Math.round((vectors.length / articles.length) * 100)}%`
    })
  }

  private async processArticlesConcurrently(
    articles: NewsArticle[],
    objectKey: string,
    concurrency: number = 2
  ): Promise<VectorRecord[]> {
    const vectors: VectorRecord[] = []

    for (let i = 0; i < articles.length; i += concurrency) {
      const batch = articles.slice(i, i + concurrency)

      logger.info('Processing batch', {
        batchStart: i + 1,
        batchSize: batch.length,
        totalArticles: articles.length
      })

      const batchPromises = batch.map(async (article, batchIndex) => {
        const articleIndex = i + batchIndex
        const vectorId = this.generateUniqueVectorId(article)

        try {
          const textToEmbed = `${article.title}\n\n${article.description}\n\n${
            article.content || ''
          }`.substring(0, 8000)

          const embeddings = await this.generateEmbeddingWithRetry(
            textToEmbed,
            2
          )

          return {
            id: vectorId,
            values: embeddings,
            metadata: {
              title: article.title,
              url: article.url,
              publishedAt: article.publishedAt,
              source: article.source?.name || 'Unknown',
              content: article.content || article.description || ''
            }
          }
        } catch (error) {
          logger.error('Failed to process article in batch', {
            title: article.title,
            articleIndex: articleIndex + 1,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          return null
        }
      })

      const batchResults = await Promise.allSettled(batchPromises)

      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled' && result.value) {
          vectors.push(result.value)
          logger.info('Article processed successfully', {
            vectorId: result.value.id,
            title: result.value.metadata.title,
            url: result.value.metadata.url,
            articleIndex: i + batchIndex + 1
          })
        }
      })
    }

    return vectors
  }

  private async generateEmbeddingWithRetry(
    text: string,
    maxRetries: number = 2
  ): Promise<number[]> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info('Generating embedding', {
          attempt,
          maxRetries,
          textLength: text.length
        })

        return await this.aiProvider.generateBedrockEmbedding(text)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        logger.error('Error generating embedding', {
          attempt,
          maxRetries,
          error: lastError.message,
          errorName: lastError.name
        })

        if (attempt === maxRetries) {
          throw lastError
        }
      }
    }

    throw lastError || new Error('Max retries exceeded')
  }

  private generateUniqueVectorId(article: NewsArticle): string {
    // Use article URL as the primary identifier for deduplication
    const urlHash = createHash('sha256')
      .update(article.url)
      .digest('hex')
      .substring(0, 16) // Use first 16 characters for shorter IDs
    return `article-${urlHash}`
  }

  private validateS3Data(data: unknown): NewsArticle[] {
    let parsedData: unknown
    try {
      parsedData = JSON.parse(data as string)
    } catch (error) {
      logger.error('Failed to parse JSON from S3', {
        error: error instanceof Error ? error.message : 'Unknown error',
        newsJsonLength: (data as string).length,
        newsJsonPreview: (data as string).substring(0, 200)
      })
      throw new Error('Invalid JSON format in S3 file')
    }

    if (!Array.isArray(parsedData)) {
      logger.error('Parsed data is not an array', {
        dataType: typeof parsedData,
        dataPreview: JSON.stringify(parsedData).substring(0, 200)
      })
      throw new Error('Expected array of articles, got: ' + typeof parsedData)
    }

    return parsedData as NewsArticle[]
  }
}
