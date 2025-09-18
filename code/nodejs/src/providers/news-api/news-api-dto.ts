export interface NewsArticle {
  source: {
    id: string | null
    name: string
  }
  author: string | null
  title: string
  description: string | null
  url: string
  urlToImage: string | null
  publishedAt: string
  content: string | null
}

export interface NewsApiResponse {
  status: string
  totalResults: number
  articles: NewsArticle[]
}

export interface SearchNewsParams {
  q: string
  searchIn?: 'title' | 'description' | 'content'
  sources?: string
  domains?: string
  excludeDomains?: string
  from?: string
  to?: string
  language?: string
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt'
  pageSize?: number
  page?: number
}

// Error response from NewsAPI
export interface NewsApiErrorResponse {
  status: string
  code: string
  message: string
}

export interface TopHeadlinesParams {
  /** The 2-letter ISO 3166-1 code of the country you want to get headlines for */
  country?: string
  /** The category you want to get headlines for */
  category?:
    | 'business'
    | 'entertainment'
    | 'general'
    | 'health'
    | 'science'
    | 'sports'
    | 'technology'
  /** Keywords or phrases to search for in the article title and body */
  q?: string
  /** A comma-seperated string of identifiers for the news sources or blogs you want headlines from */
  sources?: string
  /** The number of results to return per page (max 100) */
  pageSize?: number
  /** Use this to page through the results */
  page?: number
}

export interface NewsSource {
  /** The identifier of the news source. You can use this with the sources parameter in topHeadlines endpoint */
  id: string
  /** The name of the news source */
  name: string
  /** A description of the news source */
  description: string
  /** The URL of the news source */
  url: string
  /** The category the news source focuses on */
  category: string
  /** The language the news source is written in */
  language: string
  /** The country this news source is based in (or mainly writes about) */
  country: string
}

export interface NewsApiSourcesResponse {
  status: string
  sources: NewsSource[]
}
