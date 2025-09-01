export interface BucketProvider {
  uploadJson(data: string, filename: string): Promise<void>
}
