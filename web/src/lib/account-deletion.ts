import {
  BatchWriteCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from './dynamodb.ts'
import type { AuthenticatedHousehold } from './household.ts'

export const ACCOUNT_DELETION_CONFIRMATION = '記録をすべて削除'
export const ACCOUNT_DELETION_MAX_ITEMS = 10_000

type DynamoKey = { PK: string; SK: string }
type DeletionClient = {
  send(command: unknown): Promise<{
    Items?: unknown[]
    LastEvaluatedKey?: Record<string, unknown>
    UnprocessedItems?: Record<string, Array<{ DeleteRequest?: { Key?: DynamoKey } }>>
  }>
}

export interface AccountDeletionContext {
  household: AuthenticatedHousehold
  providerSubject: string
}

function membershipKey(context: AccountDeletionContext) {
  return {
    PK: `USER#${context.providerSubject}`,
    SK: `MEMBERSHIP#${context.household.householdId}`,
  }
}

function validHouseholdKey(value: unknown, partitionKey: string): DynamoKey | null {
  if (!value || typeof value !== 'object') return null
  const item = value as { PK?: unknown; SK?: unknown }
  if (item.PK !== partitionKey || typeof item.SK !== 'string' || !item.SK) return null
  return { PK: partitionKey, SK: item.SK }
}

async function listHouseholdKeys(
  partitionKey: string,
  client: DeletionClient
): Promise<DynamoKey[]> {
  const keys: DynamoKey[] = []
  let cursor: Record<string, unknown> | undefined

  do {
    const result = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': partitionKey },
      ProjectionExpression: 'PK, SK',
      ConsistentRead: true,
      ExclusiveStartKey: cursor,
    }))
    for (const item of result.Items ?? []) {
      const key = validHouseholdKey(item, partitionKey)
      if (!key) throw new Error('Household deletion query returned an invalid key')
      keys.push(key)
      if (keys.length > ACCOUNT_DELETION_MAX_ITEMS) {
        throw new Error('Household deletion exceeds the reviewed item limit')
      }
    }
    cursor = result.LastEvaluatedKey
  } while (cursor)

  return keys
}

async function deleteKeys(keys: DynamoKey[], client: DeletionClient) {
  for (let offset = 0; offset < keys.length; offset += 25) {
    let pending = keys.slice(offset, offset + 25).map((Key) => ({ DeleteRequest: { Key } }))
    for (let attempt = 0; pending.length > 0 && attempt < 6; attempt += 1) {
      const result = await client.send(new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: pending },
      }))
      pending = (result.UnprocessedItems?.[TABLE_NAME] ?? []).flatMap((request) => (
        request.DeleteRequest?.Key ? [{ DeleteRequest: { Key: request.DeleteRequest.Key } }] : []
      ))
      if (pending.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (2 ** attempt)))
      }
    }
    if (pending.length > 0) throw new Error('Household deletion could not remove every item')
  }
}

export async function deleteHouseholdAccountData(
  context: AccountDeletionContext,
  client: DeletionClient = docClient
) {
  if (
    context.household.partitionMode !== 'household'
    || context.household.providerSubject !== context.providerSubject
  ) {
    throw new Error('Account deletion requires a verified household identity')
  }

  const requestedAt = new Date().toISOString()
  await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: membershipKey(context),
    UpdateExpression: 'SET #status = :deleting, deletionRequestedAt = :requestedAt',
    ConditionExpression: [
      'attribute_exists(PK)',
      'attribute_exists(SK)',
      '(attribute_not_exists(householdId) OR householdId = :householdId)',
      '(attribute_not_exists(#status) OR #status IN (:active, :deleting))',
    ].join(' AND '),
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':active': 'active',
      ':deleting': 'deleting',
      ':householdId': context.household.householdId,
      ':requestedAt': requestedAt,
    },
  }))

  // Once membership is "deleting", new Web/Alexa household resolution fails closed.
  // Re-query after each batch so a request authorized just before the lock cannot
  // leave an item behind.
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const keys = await listHouseholdKeys(context.household.partitionKey, client)
    if (keys.length === 0) break
    await deleteKeys(keys, client)
    if (sweep === 3) throw new Error('Household data changed during deletion')
  }

  if ((await listHouseholdKeys(context.household.partitionKey, client)).length > 0) {
    throw new Error('Household deletion verification failed')
  }

  // Give requests that passed authentication immediately before the deletion lock
  // time to finish, then verify once more before removing the membership mapping.
  await new Promise((resolve) => setTimeout(resolve, 250))
  const lateKeys = await listHouseholdKeys(context.household.partitionKey, client)
  if (lateKeys.length > 0) {
    await deleteKeys(lateKeys, client)
    if ((await listHouseholdKeys(context.household.partitionKey, client)).length > 0) {
      throw new Error('Household deletion final verification failed')
    }
  }

  await client.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: membershipKey(context),
    ConditionExpression: '#status = :deleting',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':deleting': 'deleting' },
  }))

  return { success: true as const }
}
