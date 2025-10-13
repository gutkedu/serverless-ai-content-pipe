import { AIProvider } from '@/providers/ai/ai-provider.js'
import { EmailProvider } from '@/providers/email/email-provider.js'
import { VectorRepository } from '@/repositories/vector-repository.js'
import { getLogger } from '@/shared/logger/get-logger.js'

const logger = getLogger()

export interface GenerateNewsletterRequest {
  topic: string
  recipients: string[]
  maxArticles?: number
}

export interface GenerateNewsletterResponse {
  success: boolean
  message: string
  articlesFound?: number
  emailSent?: boolean
  messageId?: string
}

/**
 * Generate Newsletter Use Case
 *
 * Orchestrates the workflow:
 * 1. Search Pinecone for relevant articles
 * 2. Generate newsletter content using AI
 * 3. Send newsletter via email
 */
export class GenerateNewsletterUseCase {
  constructor(
    private readonly aiProvider: AIProvider,
    private readonly emailProvider: EmailProvider,
    private readonly vectorRepository: VectorRepository
  ) {}

  async execute(
    request: GenerateNewsletterRequest
  ): Promise<GenerateNewsletterResponse> {
    try {
      logger.info('Starting newsletter generation', {
        topic: request.topic,
        recipients: request.recipients,
        maxArticles: request.maxArticles
      })

      // Step 1: Search Pinecone for relevant articles
      logger.info('Step 1: Searching for articles', { topic: request.topic })

      const queryEmbedding = await this.aiProvider.generateBedrockEmbedding(
        request.topic
      )

      const searchResults = await this.vectorRepository.search({
        vector: queryEmbedding,
        topK: request.maxArticles || 10,
        includeMetadata: true
      })

      if (searchResults.length === 0) {
        logger.warn('No articles found for topic', { topic: request.topic })
        return {
          success: false,
          message: `No articles found for topic: ${request.topic}`,
          articlesFound: 0
        }
      }

      logger.info('Articles found', { count: searchResults.length })

      // Step 2: Generate newsletter content using AI
      logger.info('Step 2: Generating newsletter content')

      const articlesContext = searchResults
        .map((result, index) => {
          const metadata = result.metadata || {}
          return `
Article ${index + 1}:
Title: ${metadata.title || 'Untitled'}
Source: ${metadata.source || 'Unknown'}
Author: ${metadata.author || 'Unknown'}
Published: ${metadata.publishedAt || 'Unknown date'}
Description: ${metadata.description || 'No description'}
URL: ${metadata.url || 'No URL'}
Relevance Score: ${(result.score * 100).toFixed(1)}%
`
        })
        .join('\n---\n')

      const prompt = `You are an expert newsletter writer. Create an engaging HTML newsletter about "${request.topic}".

Here are ${searchResults.length} relevant articles I found:

${articlesContext}

Instructions:
1. Create a professional HTML newsletter with a compelling subject line
2. Write an engaging introduction about why this topic matters
3. Summarize the key insights from the articles above
4. Include article titles as clickable links (use the URLs provided)
5. Add a brief conclusion
6. Use clean HTML formatting with proper headings, paragraphs, and styling
7. Make it readable and visually appealing

Format your response EXACTLY as:
SUBJECT: [your subject line here]
BODY:
[your HTML content here]

Start your response now:`

      const generatedContent = await this.aiProvider.generateWithConverse(
        prompt,
        4096
      )

      // Parse the generated content
      const subjectMatch = generatedContent.match(/SUBJECT:\s*(.+?)(?:\n|$)/i)
      const bodyMatch = generatedContent.match(/BODY:\s*([\s\S]+)/i)

      if (!subjectMatch || !bodyMatch) {
        throw new Error('Failed to parse generated newsletter content')
      }

      const subject = subjectMatch[1].trim()
      const body = bodyMatch[1].trim()

      logger.info('Newsletter content generated', {
        subjectLength: subject.length,
        bodyLength: body.length
      })

      // Step 3: Send newsletter via email
      logger.info('Step 3: Sending newsletter', {
        recipients: request.recipients
      })

      const emailResult = await this.emailProvider.sendEmailToMultiple({
        to: request.recipients,
        subject,
        body,
        isHtml: true
      })

      logger.info('Newsletter sent successfully', {
        messageId: emailResult.messageId,
        recipientCount: emailResult.recipientCount
      })

      return {
        success: true,
        message: 'Newsletter generated and sent successfully',
        articlesFound: searchResults.length,
        emailSent: true,
        messageId: emailResult.messageId
      }
    } catch (error) {
      logger.error('Error generating newsletter', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })

      return {
        success: false,
        message: `Failed to generate newsletter: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        emailSent: false
      }
    }
  }
}
