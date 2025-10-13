import { getLogger } from '../logger/get-logger.js'
import { getParameter } from '@aws-lambda-powertools/parameters/ssm'

const logger = getLogger()

export async function fetchFromEmail(): Promise<string> {
  const fromEmail = await getParameter(process.env.FROM_EMAIL_PARAM as string, {
    maxAge: 15 * 60 // 15 minutes cache
  })

  if (!fromEmail) {
    const errorMessage = 'From email not found in SSM Parameter Store'
    logger.error(errorMessage)
    throw new Error(errorMessage)
  }

  return fromEmail
}
