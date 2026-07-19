import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'DrugAndOathRecords'
const USER_ID    = process.env.USER_ID ?? 'default-user'

const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
})

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
})

const SETTINGS_SK = 'SETTINGS#medication'

// Lambda は UTC で動くので JST (+9h) に変換する
function nowJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return {
    date: jst.toISOString().slice(0, 10),  // YYYY-MM-DD
    time: jst.toISOString().slice(11, 16), // HH:MM
    iso:  new Date().toISOString(),
  }
}

export async function recordMedication(timing) {
  const { date, time, iso } = nowJST()
  const uuid = randomUUID()
  const pk   = `USER#${USER_ID}`
  const sk   = `RECORD#${date}T${time}:00#${uuid}`

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK:        pk,
      SK:        sk,
      userId:    USER_ID,
      date,
      time,
      timing,
      source:    'alexa',
      createdAt: iso,
    },
  }))

  return { date, time, timing }
}

export async function getMedicationSettings() {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${USER_ID}`,
      SK: SETTINGS_SK,
    },
  }))

  if (!result.Item) return {}
  return {
    medicationName: typeof result.Item.medicationName === 'string' ? result.Item.medicationName : '',
    reminderSchedule: Array.isArray(result.Item.reminderSchedule) ? result.Item.reminderSchedule : undefined,
  }
}
