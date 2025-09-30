import {
  SearchNewsParams,
  NewsApiResponse,
  TopHeadlinesParams,
  NewsApiSourcesResponse
} from './news-api-dto.js'

export interface NewsProvider {
  /**
   * Search through millions of articles from over 80,000 large and small news sources and blogs.
   * This endpoint is better suited for news analysis and article discovery.
   */
  searchNews(params: SearchNewsParams): Promise<NewsApiResponse>

  /**
   * Returns breaking news headlines for a country, category, or single source.
   * Ideal for use with news tickers or anywhere you want to display live up-to-date news headlines.
   */
  getTopHeadlines(params: TopHeadlinesParams): Promise<NewsApiResponse>

  /**
   * Returns the subset of news sources that top headlines are available from.
   * Use the ids with the sources parameter in topHeadlines endpoint.
   */
  getSources(): Promise<NewsApiSourcesResponse>
}
