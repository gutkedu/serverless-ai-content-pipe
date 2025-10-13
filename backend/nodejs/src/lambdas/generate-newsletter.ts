import { Handler } from 'aws-lambda'
import { BedrockProvider } from '@/providers/ai/bedrock-provider.js'
import { SESEmailProvider } from '@/providers/email/ses-provider.js'
import { PineconeVectorRepository } from '@/repositories/pinecone/pinecone-vector-repository.js'
import { getLogger } from '@/shared/logger/get-logger.js'
import { fetchPineconeApiKey } from '@/shared/parameters/fetch-pinecone-apikey.js'
import { fetchFromEmail } from '@/shared/parameters/fetch-from-email.js'

const logger = getLogger()

interface NewsletterRequest {
  topic: string
  recipients: string[]
  maxArticles?: number
}

interface NewsletterResponse {
  success: boolean
  message: string
  articlesFound?: number
  emailSent?: boolean
  messageId?: string
}

/**
 * Manual Orchestrator Lambda
 *
 * Workflow:
 * 1. Search Pinecone for relevant articles
 * 2. Generate newsletter content using Bedrock
 * 3. Send newsletter via SES
 *
 * No agent orchestration - direct, deterministic, efficient
 */
export const handler: Handler<NewsletterRequest, NewsletterResponse> = async (
  event
) => {
  try {
    logger.info('Starting newsletter generation', {
      topic: event.topic,
      recipients: event.recipients,
      maxArticles: event.maxArticles
    })

    // Initialize providers
    const pineconeApiKey = await fetchPineconeApiKey()
    const fromEmail = await fetchFromEmail()
    const pineconeIndex = 'ai-content-pipe' // Hardcoded index name (same as other Lambdas)

    // Use Llama 3.3 70B - supports Converse API and works well
    const modelId = process.env.MODEL_ID || 'us.meta.llama3-3-70b-instruct-v1:0'

    const pineconeRepository = new PineconeVectorRepository(
      pineconeApiKey,
      pineconeIndex
    )
    const bedrockProvider = new BedrockProvider(modelId)
    const emailProvider = new SESEmailProvider(fromEmail) // Step 1: Search Pinecone for relevant articles
    logger.info('Step 1: Searching for articles', { topic: event.topic })

    const queryEmbedding = await bedrockProvider.generateBedrockEmbedding(
      event.topic
    )

    const searchResults = await pineconeRepository.search({
      vector: queryEmbedding,
      topK: event.maxArticles || 10,
      includeMetadata: true
    })

    if (searchResults.length === 0) {
      logger.warn('No articles found for topic', { topic: event.topic })
      return {
        success: false,
        message: `No articles found for topic: ${event.topic}`,
        articlesFound: 0
      }
    }

    logger.info('Articles found', { count: searchResults.length })

    // Step 2: Generate newsletter content using Bedrock
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

    const prompt = `You are an expert newsletter writer. Create an engaging HTML newsletter about "${event.topic}".

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

    const generatedContent = await bedrockProvider.generateWithConverse(
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

    // Step 3: Send newsletter via SES
    logger.info('Step 3: Sending newsletter', {
      recipients: event.recipients
    })

    const emailResult = await emailProvider.sendEmailToMultiple({
      to: event.recipients,
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
