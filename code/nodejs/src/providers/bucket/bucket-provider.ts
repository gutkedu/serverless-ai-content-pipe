export interface BucketProvider {
  uploadJson(data: unknown, filename: string): Promise<void>
  getObject(key: string): Promise<string>
}
