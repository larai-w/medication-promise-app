import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { pathToFileURL } from 'node:url'

const HOUSEHOLD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
export function parseMigrationOptions(argv = process.argv.slice(2), env = process.env) {
  const write = argv.includes('--write')
  const sourceUserId = env.SOURCE_USER_ID || env.USER_ID || 'default-user'
  const targetHouseholdId = env.TARGET_HOUSEHOLD_ID || env.HOUSEHOLD_ID || 'owner-household'
  const tableName = env.DYNAMODB_TABLE_NAME || 'DrugAndOathRecords'
  const region = env.DYNAMODB_REGION || env.AWS_REGION || 'us-east-1'

  if (!HOUSEHOLD_ID_PATTERN.test(targetHouseholdId)) {
    throw new Error('TARGET_HOUSEHOLD_ID must be 3-64 lowercase letters, numbers, underscores, or hyphens')
  }
  if (!sourceUserId || sourceUserId.includes('#')) {
    throw new Error('SOURCE_USER_ID must be a non-empty legacy user id without #')
  }

  return {
    write,
    tableName,
    region,
    sourcePK: `USER#${sourceUserId}`,
    targetPK: `HOUSEHOLD#${targetHouseholdId}`,
    targetHouseholdId,
  }
}

export function buildMigratedItem(item, targetPK, targetHouseholdId) {
  if (!item || typeof item !== 'object') throw new Error('Migration item must be an object')
  if (typeof item.SK !== 'string') throw new Error('Migration item is missing SK')
  return {
    ...item,
    PK: targetPK,
    userId: targetHouseholdId,
    migratedFromPK: item.PK,
    migratedAt: new Date().toISOString(),
  }
}

async function queryAllItems(docClient, tableName, sourcePK) {
  const items = []
  let ExclusiveStartKey

  do {
    const result = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': sourcePK },
      ExclusiveStartKey,
    }))
    items.push(...(result.Items ?? []))
    ExclusiveStartKey = result.LastEvaluatedKey
  } while (ExclusiveStartKey)

  return items
}

async function putIfMissing(docClient, tableName, item) {
  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }))
    return 'copied'
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return 'exists'
    throw error
  }
}

export async function runMigration(options, docClient) {
  const sourceItems = await queryAllItems(docClient, options.tableName, options.sourcePK)
  const summary = {
    mode: options.write ? 'write' : 'dry-run',
    sourcePK: options.sourcePK,
    targetPK: options.targetPK,
    scanned: sourceItems.length,
    copied: 0,
    existing: 0,
  }

  if (!options.write) return summary

  for (const item of sourceItems) {
    const status = await putIfMissing(
      docClient,
      options.tableName,
      buildMigratedItem(item, options.targetPK, options.targetHouseholdId)
    )
    if (status === 'copied') summary.copied += 1
    else summary.existing += 1
  }

  return summary
}

async function main() {
  const options = parseMigrationOptions()
  const client = new DynamoDBClient({ region: options.region })
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  })
  const summary = await runMigration(options, docClient)
  console.log(JSON.stringify(summary, null, 2))
  if (!options.write) {
    console.log('Dry-run only. Re-run with --write to copy items without deleting the legacy partition.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
