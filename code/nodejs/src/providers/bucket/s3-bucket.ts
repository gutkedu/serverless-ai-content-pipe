import { s3 } from '@/shared/clients/s3.js'
import { BucketProvider } from './bucket-provider.js'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { IntegrationError } from '@/shared/errors/integration-error.js'
import { getLogger } from '@/shared/logger/get-logger.js'

const logger = getLogger()

export class S3BucketProvider implements BucketProvider {
  private readonly s3Client = s3()
  private readonly bucketName

  constructor() {
    this.bucketName = process.env.BUCKET_NAME || ''
  }

  async uploadJson(data: string, filename: string): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
        Body: JSON.stringify(data),
        ContentType: 'application/json'
      })

      await this.s3Client.send(command)
    } catch (error) {
      logger.error({
        message: 'Failed to upload JSON to S3',
        error
      })
      throw new IntegrationError('Failed to upload JSON to S3')
    }
  }
}
