export interface VectorRecord {
  id: string
  values: number[]
  metadata: Record<string, string | number | boolean>
}

export interface SearchQuery {
  vector: number[]
  topK: number
  filter?: Record<string, string | number | boolean>
  includeMetadata?: boolean
}

export interface SearchResult {
  id: string
  score: number
  metadata?: Record<string, string | number | boolean>
}
