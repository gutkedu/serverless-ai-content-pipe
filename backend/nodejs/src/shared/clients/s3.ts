import { S3Client } from '@aws-sdk/client-s3'

let client: S3Client | null = null

export const s3 = (): S3Client => {
  if (client) {
    return client
  }
  client = new S3Client({
    region: process.env.AWS_REGION
  })
  return client
}
