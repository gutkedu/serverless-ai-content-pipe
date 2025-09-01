import { getLogger } from '@/shared/logger/get-logger.js'

import { IntegrationError } from '@/shared/errors/integration-error.js'
import { NewsProvider } from './news-provider.js'
import {
  NewsApiErrorResponse,
  NewsApiResponse,
  NewsApiSourcesResponse,
  SearchNewsParams,
  TopHeadlinesParams
} from './news-api-dto.js'

const logger = getLogger()

export class NewsApiProvider implements NewsProvider {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(apikey: string) {
    this.baseUrl = 'https://newsapi.org/v2'
    this.apiKey = apikey
    if (!this.apiKey) {
      throw new IntegrationError('News API key is not set', {
        service: 'news-api'
      })
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    params: SearchNewsParams | TopHeadlinesParams | Record<string, never>
  ): Promise<T> {
    try {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      searchParams.append('apiKey', this.apiKey)

      const response = await fetch(
        `${this.baseUrl}${endpoint}?${searchParams.toString()}`
      )
      const data = await response.json()

      if (!response.ok) {
        const errorData = data as NewsApiErrorResponse
        logger.error(`Error fetching from NewsAPI endpoint ${endpoint}`, {
          status: response.status,
          errorCode: errorData.code,
          errorMessage: errorData.message,
          params
        })
        throw new IntegrationError(errorData.message, {
          service: 'news-api',
          details: `status=${response.status}, code=${errorData.code}, endpoint=${endpoint}`
        })
      }

      return data as T
    } catch (error) {
      logger.error(
        `Unexpected error in NewsAPI provider for endpoint ${endpoint}`,
        {
          error,
          params
        }
      )
      if (error instanceof IntegrationError) {
        throw error
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      throw new IntegrationError('Unexpected error fetching from NewsAPI', {
        service: 'news-api',
        details: errorMessage
      })
    }
  }

  async searchNews(params: SearchNewsParams): Promise<NewsApiResponse> {
    return this.makeRequest<NewsApiResponse>('/everything', params)
  }

  async getTopHeadlines(params: TopHeadlinesParams): Promise<NewsApiResponse> {
    return this.makeRequest<NewsApiResponse>('/top-headlines', params)
  }

  async getSources(): Promise<NewsApiSourcesResponse> {
    return this.makeRequest<NewsApiSourcesResponse>(
      '/top-headlines/sources',
      {}
    )
  }
}
