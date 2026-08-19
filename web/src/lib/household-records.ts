import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { docClient, TABLE_NAME, decodeSK, encodeSK, makeSK } from './dynamodb.ts'
import type { AuthenticatedHousehold } from './household.ts'
import { activeMembershipCondition } from './membership-write-guard.ts'
import type { DailyCondition, DynamoRecord, MedicationRecord } from '../types'

type QueryClient = { send(command: unknown): Promise<{ Items?: unknown[] }> }
type MutationClient = { send(command: unknown): Promise<{ Attributes?: unknown; Item?: unknown }> }

type ConditionItem = {
  PK: string
  SK: string
  date: string
  score: DailyCondition['score']
  observedAt: string
  note?: string
}

function toApiRecord(item: DynamoRecord): MedicationRecord {
  return {
    id: encodeSK(item.SK),
    userId: item.userId,
    date: item.date,
    time: item.time,
    timing: item.timing,
    source: item.source,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function toApiCondition(item: ConditionItem): DailyCondition {
  return { date: item.date, score: item.score, observedAt: item.observedAt, note: item.note }
}

export async function getDailyConditionForHousehold(
  household: AuthenticatedHousehold,
  date: string,
  client: QueryClient = docClient
) {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: household.partitionKey, SK: `WELLNESS#${date}` },
    ConsistentRead: true,
  }))
  const item = (result as { Item?: unknown }).Item
  return item ? toApiCondition(item as ConditionItem) : null
}

export async function putDailyConditionForHousehold(
  household: AuthenticatedHousehold,
  input: { date: string; score: DailyCondition['score']; note?: string },
  client: MutationClient = docClient
) {
  const item: ConditionItem = {
    PK: household.partitionKey,
    SK: `WELLNESS#${input.date}`,
    date: input.date,
    score: input.score,
    observedAt: new Date().toISOString(),
    note: input.note,
  }
  if (household.partitionMode === 'household') {
    await client.send(new TransactWriteCommand({
      TransactItems: [
        { ConditionCheck: activeMembershipCondition(household) },
        { Put: { TableName: TABLE_NAME, Item: item } },
      ],
    }))
  } else {
    await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))
  }
  return toApiCondition(item)
}

export async function listRecordsForHousehold(
  household: AuthenticatedHousehold,
  query: { from?: string; to?: string; date?: string },
  client: QueryClient = docClient
) {
  let keyCondition: string
  let expressionValues: Record<string, string>

  if (query.date) {
    keyCondition = 'PK = :pk AND begins_with(SK, :prefix)'
    expressionValues = { ':pk': household.partitionKey, ':prefix': `RECORD#${query.date}` }
  } else if (query.from && query.to) {
    keyCondition = 'PK = :pk AND SK BETWEEN :from AND :to'
    expressionValues = { ':pk': household.partitionKey, ':from': `RECORD#${query.from}`, ':to': `RECORD#${query.to}~` }
  } else {
    throw new Error('date または from/to が必要です')
  }

  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: expressionValues,
    ScanIndexForward: true,
  }))

  return (result.Items as DynamoRecord[] ?? []).map(toApiRecord)
}

export async function createRecordForHousehold(
  household: AuthenticatedHousehold,
  input: { date: string; time: string; timing: MedicationRecord['timing']; notes?: string },
  client: MutationClient = docClient
) {
  const sk = makeSK(input.date, input.time, randomUUID())
  const now = new Date().toISOString()

  const item: DynamoRecord = {
    PK: household.partitionKey,
    SK: sk,
    userId: household.householdId,
    date: input.date,
    time: input.time,
    timing: input.timing,
    source: 'manual',
    notes: input.notes,
    createdAt: now,
  }

  if (household.partitionMode === 'household') {
    await client.send(new TransactWriteCommand({
      TransactItems: [
        { ConditionCheck: activeMembershipCondition(household) },
        { Put: { TableName: TABLE_NAME, Item: item } },
      ],
    }))
  } else {
    await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))
  }
  return toApiRecord(item)
}

export async function updateRecordForHousehold(
  household: AuthenticatedHousehold,
  encodedId: string,
  input: { time?: string; timing?: MedicationRecord['timing']; notes?: string },
  client: MutationClient = docClient
) {
  const sk = decodeSK(encodedId)
  const now = new Date().toISOString()

  const updateParts: string[] = ['updatedAt = :updatedAt']
  const values: Record<string, string> = { ':updatedAt': now }

  if (input.time !== undefined) { updateParts.push('#t = :time'); values[':time'] = input.time }
  if (input.timing !== undefined) { updateParts.push('timing = :timing'); values[':timing'] = input.timing }
  if (input.notes !== undefined) { updateParts.push('notes = :notes'); values[':notes'] = input.notes }

  if (household.partitionMode === 'household') {
    await client.send(new TransactWriteCommand({
      TransactItems: [
        { ConditionCheck: activeMembershipCondition(household) },
        { Update: {
          TableName: TABLE_NAME,
          Key: { PK: household.partitionKey, SK: sk },
          UpdateExpression: `SET ${updateParts.join(', ')}`,
          ExpressionAttributeValues: values,
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
          ...(input.time !== undefined && { ExpressionAttributeNames: { '#t': 'time' } }),
        } },
      ],
    }))

    const result = await client.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: household.partitionKey, SK: sk },
      ConsistentRead: true,
    }))
    if (!result.Item) throw new Error('Updated household record could not be read')
    return toApiRecord(result.Item as DynamoRecord)
  }

  const result = await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: household.partitionKey, SK: sk },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeValues: values,
    ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    ...(input.time !== undefined && { ExpressionAttributeNames: { '#t': 'time' } }),
    ReturnValues: 'ALL_NEW',
  }))
  return toApiRecord(result.Attributes as DynamoRecord)
}

export async function deleteRecordForHousehold(
  household: AuthenticatedHousehold,
  encodedId: string,
  client: MutationClient = docClient
) {
  const sk = decodeSK(encodedId)
  if (household.partitionMode === 'household') {
    await client.send(new TransactWriteCommand({
      TransactItems: [
        { ConditionCheck: activeMembershipCondition(household) },
        { Delete: {
          TableName: TABLE_NAME,
          Key: { PK: household.partitionKey, SK: sk },
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        } },
      ],
    }))
  } else {
    await client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: household.partitionKey, SK: sk },
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
    }))
  }
  return { success: true }
}
