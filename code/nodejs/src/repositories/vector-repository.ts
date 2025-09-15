import {
  VectorRecord,
  SearchQuery,
  SearchResult
} from './types/vector-repository-dto.js'

export interface VectorRepository {
  upsert(vectors: VectorRecord[]): Promise<void>
  search(query: SearchQuery): Promise<SearchResult[]>
  deleteById(id: string): Promise<void>
  deleteByFilter(
    filter: Record<string, string | number | boolean>
  ): Promise<void>
  getStats(): Promise<{ totalVectors: number }>
}
