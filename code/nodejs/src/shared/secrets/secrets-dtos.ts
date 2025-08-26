export enum SecretsEnums {
  NEWS_API_KEY = 'newsApiKey'
}

export interface SecretParams {
  [SecretsEnums.NEWS_API_KEY]: string
}
