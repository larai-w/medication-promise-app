import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
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

  return toMedicationSettings(result.Item)
}

function toMedicationSettings(item) {
  if (!item) return {}
  return {
    medicationName: typeof item.medicationName === 'string' ? item.medicationName : '',
    reminderSchedule: Array.isArray(item.reminderSchedule) ? item.reminderSchedule : undefined,
  }
}

// --- Household-scoped access (Issue #12) ---------------------------------
//
// These helpers write and read within a resolved household partition instead
// of the legacy USER#<default-user> partition. `household` is the object
// returned by resolveAlexaHousehold() in household.mjs and must carry a
// `partitionKey` (HOUSEHOLD#<id>) and `householdId`. The DynamoDB client is
// injectable so the data path is testable without hitting AWS.

function assertHousehold(household) {
  if (!household || typeof household.partitionKey !== 'string' || !household.partitionKey) {
    throw new Error('recordMedicationForHousehold requires a resolved household')
  }
}

export async function recordMedicationForHousehold(household, timing, { client = docClient } = {}) {
  assertHousehold(household)
  const { date, time, iso } = nowJST()
  const uuid = randomUUID()
  const sk   = `RECORD#${date}T${time}:00#${uuid}`

  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK:        household.partitionKey,
      SK:        sk,
      userId:    household.householdId,
      date,
      time,
      timing,
      source:    'alexa',
      createdAt: iso,
    },
  }))

  return { date, time, timing }
}

export async function getMedicationSettingsForHousehold(household, { client = docClient } = {}) {
  assertHousehold(household)
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: household.partitionKey,
      SK: SETTINGS_SK,
    },
  }))

  return toMedicationSettings(result.Item)
}

// --- Household membership lookup (Issue #12) ------------------------------
//
// Resolves the household memberships for a linked provider subject, following
// the membership model in docs/ALEXA_ACCOUNT_LINKING_DESIGN.md:
//
//   PK = USER#<providerSubject>
//   SK = MEMBERSHIP#<householdId>
//
// This is the adapter that resolveAlexaHousehold() calls as
// `getMembershipsBySubject`. It returns [{ householdId, status }]. The caller
// decides how zero / one / disabled / multiple memberships are handled.

const MEMBERSHIP_SK_PREFIX = 'MEMBERSHIP#'

export async function getHouseholdMembershipsBySubject(providerSubject, { client = docClient } = {}) {
  if (typeof providerSubject !== 'string' || !providerSubject) {
    throw new Error('getHouseholdMembershipsBySubject requires a provider subject')
  }

  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${providerSubject}`,
      ':prefix': MEMBERSHIP_SK_PREFIX,
    },
  }))

  return (result.Items ?? [])
    .map((item) => {
      const householdId =
        typeof item.householdId === 'string' && item.householdId
          ? item.householdId
          : typeof item.SK === 'string' && item.SK.startsWith(MEMBERSHIP_SK_PREFIX)
            ? item.SK.slice(MEMBERSHIP_SK_PREFIX.length)
            : undefined
      const status = typeof item.status === 'string' ? item.status : undefined
      return { householdId, status }
    })
    .filter((membership) => Boolean(membership.householdId))
}
