import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION ?? process.env.AWS_REGION ?? 'ap-northeast-1',
  ...(process.env.AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  }),
})

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
})

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'DrugAndOathRecords'
export const USER_ID = process.env.USER_ID || 'default-user'

export function makePK(userId: string) {
  return `USER#${userId}`
}

export function makeSK(date: string, time: string, uuid: string) {
  return `RECORD#${date}T${time}:00#${uuid}`
}

export function encodeSK(sk: string): string {
  return Buffer.from(sk).toString('base64url')
}

export function decodeSK(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf-8')
}
