import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

// 認証情報は AWS SDK の既定プロバイダチェーンに任せる。
// - Lambda: 実行ロール（セッショントークン付き）を自動使用
// - ローカル: 環境変数 / ~/.aws / SSO を自動使用
// 手動で accessKeyId/secretAccessKey だけを渡すと、Lambda のロール認証で
// 必須の AWS_SESSION_TOKEN が抜け "security token invalid" になるため渡さない。
const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION ?? process.env.AWS_REGION ?? 'ap-northeast-1',
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
