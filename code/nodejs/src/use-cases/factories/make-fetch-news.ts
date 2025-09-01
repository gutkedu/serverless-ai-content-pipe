import { S3BucketProvider } from '@/providers/bucket/s3-bucket.js'
import { FetchNewsUseCase } from '../fetch-news.js'
import { NewsApiProvider } from '@/providers/news-api/news-api-provider.js'

export function makeFetchNews(params: { newsApiKey: string }) {
  const newsProvider = new NewsApiProvider(params.newsApiKey)
  const bucketProvider = new S3BucketProvider()
  return new FetchNewsUseCase(newsProvider, bucketProvider)
}
