export enum SecretsEnums {
  NEWS_API_KEY = 'newsApiKey',
  PINECONE_API_KEY = 'pineconeApiKey'
}

export interface SecretParams {
  [SecretsEnums.NEWS_API_KEY]: string
  [SecretsEnums.PINECONE_API_KEY]: string
}
