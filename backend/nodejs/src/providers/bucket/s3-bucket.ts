import { s3 } from '@/shared/clients/s3.js'
import { BucketProvider } from './bucket-provider.js'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { IntegrationError } from '@/shared/errors/integration-error.js'
import { getLogger } from '@/shared/logger/get-logger.js'

const logger = getLogger()

export class S3BucketProvider implements BucketProvider {
  private readonly s3Client = s3()
  private readonly bucketName

  constructor() {
    this.bucketName = process.env.BUCKET_NAME || ''
  }
  async getObject(key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      })

      const response = await this.s3Client.send(command)

      if (!response.Body) {
        throw new IntegrationError('S3 object body is empty', {
          service: 's3',
          details: `No body found for object with key: ${key}`
        })
      }

      const bytes = await response.Body.transformToString()
      return bytes
    } catch (error) {
      logger.error({
        message: 'Failed to get object from S3',
        error,
        key
      })
      throw new IntegrationError('Failed to get object from S3', {
        service: 's3',
        details: (error as Error).message
      })
    }
  }

  async uploadJson(data: unknown, filename: string): Promise<void> {
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
