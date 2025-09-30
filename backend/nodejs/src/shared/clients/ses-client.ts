import { SESClient } from '@aws-sdk/client-ses'

let client: SESClient | null = null

export const ses = (): SESClient => {
  if (client) {
    return client
  }
  client = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1'
  })
  return client
}
