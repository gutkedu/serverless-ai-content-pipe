import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

let client: DynamoDBDocumentClient | null = null

export const dynamo = (): DynamoDBDocumentClient => {
  if (client) {
    return client
  }
  client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION
    })
  )
  return client
}
