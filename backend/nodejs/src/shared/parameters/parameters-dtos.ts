export enum ParametersEnums {
  NEWS_API_KEY = '/ai-content-pipe/news-api-key',
  PINECONE_API_KEY = '/ai-content-pipe/pinecone-api-key'
}

export interface ParameterConfig {
  name: string
  decrypt?: boolean
  maxAge?: number
}
