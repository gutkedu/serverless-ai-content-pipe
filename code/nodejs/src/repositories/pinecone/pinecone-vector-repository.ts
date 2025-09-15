import { Pinecone } from '@pinecone-database/pinecone'
import {
  VectorRecord,
  SearchQuery,
  SearchResult
} from '../types/vector-repository-dto.js'
import { VectorRepository } from '../vector-repository.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import { IntegrationError } from '@/shared/errors/integration-error.js'

const logger = getLogger()

export class PineconeVectorRepository implements VectorRepository {
  private pinecone: Pinecone
  private indexName: string

  constructor(apiKey: string, indexName: string) {
    this.pinecone = new Pinecone({ apiKey })
    this.indexName = indexName
  }

  async upsert(vectors: VectorRecord[]): Promise<void> {
    try {
      logger.info('Upserting vectors to Pinecone index', {
        vectorCount: vectors.length,
        indexName: this.indexName
      })

      const index = this.pinecone.index(this.indexName)
      const pineconeVectors = vectors.map((vector) => ({
        id: vector.id,
        values: vector.values,
        metadata: vector.metadata
      }))

      await index.upsert(pineconeVectors)

      logger.info('Successfully upserted vectors to Pinecone', {
        vectorCount: vectors.length,
        indexName: this.indexName
      })
    } catch (error) {
      logger.error('Error upserting vectors to Pinecone', {
        error: error instanceof Error ? error.message : 'Unknown error',
        vectorCount: vectors.length,
        indexName: this.indexName
      })
      throw new IntegrationError(
        `Failed to upsert vectors to Pinecone index ${this.indexName}`,
        {
          vectorCount: vectors.length,
          indexName: this.indexName,
          originalError:
            error instanceof Error ? error.message : 'Unknown error'
        }
      )
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    try {
      logger.info('Searching vectors in Pinecone index', {
        indexName: this.indexName,
        topK: query.topK,
        hasFilter: !!query.filter,
        includeMetadata: query.includeMetadata ?? true
      })

      const index = this.pinecone.index(this.indexName)
      const queryRequest = {
        vector: query.vector,
        topK: query.topK,
        includeMetadata: query.includeMetadata ?? true,
        ...(query.filter && { filter: query.filter })
      }

      const response = await index.query(queryRequest)

      const results: SearchResult[] = (response.matches || []).map((match) => ({
        id: match.id,
        score: match.score || 0,
        metadata: match.metadata as
          | Record<string, string | number | boolean>
          | undefined
      }))

      logger.info('Successfully searched vectors in Pinecone', {
        indexName: this.indexName,
        resultsCount: results.length,
        topK: query.topK
      })
      return results
    } catch (error) {
      logger.error('Error searching vectors in Pinecone', {
        error: error instanceof Error ? error.message : 'Unknown error',
        indexName: this.indexName,
        topK: query.topK
      })
      throw new IntegrationError(
        `Failed to search vectors in Pinecone index ${this.indexName}`,
        {
          indexName: this.indexName,
          topK: query.topK,
          originalError:
            error instanceof Error ? error.message : 'Unknown error'
        }
      )
    }
  }

  async deleteById(id: string): Promise<void> {
    try {
      logger.info('Deleting vector by ID from Pinecone', {
        vectorId: id,
        indexName: this.indexName
      })

      const index = this.pinecone.index(this.indexName)
      await index.deleteOne(id)

      logger.info('Successfully deleted vector by ID from Pinecone', {
        vectorId: id,
        indexName: this.indexName
      })
    } catch (error) {
      logger.error('Error deleting vector by ID from Pinecone', {
        error: error instanceof Error ? error.message : 'Unknown error',
        vectorId: id,
        indexName: this.indexName
      })
      throw new IntegrationError(
        `Failed to delete vector with ID ${id} from Pinecone index ${this.indexName}`,
        {
          vectorId: id,
          indexName: this.indexName,
          originalError:
            error instanceof Error ? error.message : 'Unknown error'
        }
      )
    }
  }

  async deleteByFilter(
    filter: Record<string, string | number | boolean>
  ): Promise<void> {
    try {
      logger.info('Deleting vectors by filter from Pinecone', {
        filter,
        indexName: this.indexName
      })

      const index = this.pinecone.index(this.indexName)
      await index.deleteMany({ filter })

      logger.info('Successfully deleted vectors by filter from Pinecone', {
        filter,
        indexName: this.indexName
      })
    } catch (error) {
      logger.error('Error deleting vectors by filter from Pinecone', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filter,
        indexName: this.indexName
      })
      throw new IntegrationError(
        `Failed to delete vectors by filter from Pinecone index ${this.indexName}`,
        {
          filterString: JSON.stringify(filter),
          indexName: this.indexName,
          originalError:
            error instanceof Error ? error.message : 'Unknown error'
        }
      )
    }
  }

  async getStats(): Promise<{ totalVectors: number }> {
    try {
      logger.info('Getting stats for Pinecone index', {
        indexName: this.indexName
      })

      const index = this.pinecone.index(this.indexName)
      const stats = await index.describeIndexStats()

      const totalVectors = stats.totalRecordCount || 0
      logger.info('Successfully retrieved Pinecone index stats', {
        indexName: this.indexName,
        totalVectors
      })

      return { totalVectors }
    } catch (error) {
      logger.error('Error getting Pinecone index stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        indexName: this.indexName
      })
      throw new IntegrationError(
        `Failed to get stats for Pinecone index ${this.indexName}`,
        {
          indexName: this.indexName,
          originalError:
            error instanceof Error ? error.message : 'Unknown error'
        }
      )
    }
  }
}
