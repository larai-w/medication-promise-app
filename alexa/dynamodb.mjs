import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
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

const SNAPSHOT_TIMINGS = ['朝', '昼', '晩', '夜8時', '夜9時']
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/

// Use only a version actually observed in storage, never normalized defaults.
export function captureScheduleSnapshot(settings, date, time, timing, capturedAt) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return undefined
  const body = settings
  const version = body.updatedAt
  if (typeof version !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(version)) return undefined
  const versionMs = Date.parse(version)
  if (!Number.isFinite(versionMs) || new Date(versionMs).toISOString() !== version) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !CLOCK.test(time)) return undefined
  const occurredMs = Date.parse(`${date}T${time}:00+09:00`)
  if (!Number.isFinite(occurredMs) || new Date(occurredMs + 9 * 3600000).toISOString().slice(0, 10) !== date) return undefined
  const capturedMs = Date.parse(capturedAt)
  if (!Number.isFinite(capturedMs) || versionMs > occurredMs || occurredMs > capturedMs) return undefined
  const schedule = body.reminderSchedule
  if (!Array.isArray(schedule) || schedule.length !== SNAPSHOT_TIMINGS.length) return undefined
  const seen = new Set()
  for (const slot of schedule) {
    if (!slot || typeof slot !== 'object' || !SNAPSHOT_TIMINGS.includes(slot.timing)
      || seen.has(slot.timing) || typeof slot.time !== 'string' || !CLOCK.test(slot.time)) return undefined
    seen.add(slot.timing)
  }
  const slot = schedule.find((entry) => entry.timing === timing)
  return slot ? { timing, time: slot.time, settingsUpdatedAt: version, capturedAt } : undefined
}


// Lambda は UTC で動くので JST (+9h) に変換する。
// minutesAgo を渡すと、その分だけ遡った時刻を返す（「30分前に飲んだ」用）。
// 日をまたぐ場合は date も前日になる。
function nowJST(minutesAgo = 0) {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000 - minutesAgo * 60 * 1000)
  return {
    date: jst.toISOString().slice(0, 10),  // YYYY-MM-DD
    time: jst.toISOString().slice(11, 16), // HH:MM
    iso:  new Date().toISOString(),
  }
}

export async function recordMedication(timing, { client = docClient, minutesAgo = null } = {}) {
  // date/time は「飲んだ時刻」、createdAt は「記録した時刻」。別物として保存する。
  // care-event export は date/time を actualTime / occurredAt に使うため、
  // ここに記録時刻を入れてしまうと事実と違う値が研究データへ流れる。
  const { date, time } = nowJST(minutesAgo ?? 0)

  const uuid = randomUUID()
  const pk   = `USER#${USER_ID}`
  const sk   = `RECORD#${date}T${time}:00#${uuid}`

  const settings = await client.send(new GetCommand({
    TableName: TABLE_NAME, Key: { PK: pk, SK: SETTINGS_SK }, ConsistentRead: true,
  }))
  const iso = new Date().toISOString()
  const scheduleSnapshot = captureScheduleSnapshot(settings.Item, date, time, timing, iso)
  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK:        pk,
      SK:        sk,
      userId:    USER_ID,
      date,
      time,
      timing,
      source:    'alexa',
      ...(scheduleSnapshot ? { scheduleSnapshot } : {}),
      createdAt: iso,
      // 時刻を本人が言ったのか、記録時刻で代用したのかを残す
      timeSource: minutesAgo === null ? 'recorded' : 'stated',
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
  if (
    !household
    || typeof household.partitionKey !== 'string'
    || !household.partitionKey
    || typeof household.householdId !== 'string'
    || !household.householdId
    || typeof household.providerSubject !== 'string'
    || !household.providerSubject
  ) {
    throw new Error('recordMedicationForHousehold requires a resolved household')
  }
}

function activeMembershipCondition(household) {
  return {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${household.providerSubject}`,
      SK: `MEMBERSHIP#${household.householdId}`,
    },
    ConditionExpression: [
      'attribute_exists(PK)',
      'attribute_exists(SK)',
      '(attribute_not_exists(householdId) OR householdId = :householdId)',
      '(attribute_not_exists(#status) OR #status = :active)',
    ].join(' AND '),
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':active': 'active',
      ':householdId': household.householdId,
    },
  }
}

export async function recordMedicationForHousehold(household, timing, { client = docClient, minutesAgo = null } = {}) {
  assertHousehold(household)
  const { date, time } = nowJST(minutesAgo ?? 0)

  const uuid = randomUUID()
  const sk   = `RECORD#${date}T${time}:00#${uuid}`

  const settings = await client.send(new GetCommand({
    TableName: TABLE_NAME, Key: { PK: household.partitionKey, SK: SETTINGS_SK }, ConsistentRead: true,
  }))
  const iso = new Date().toISOString()
  const scheduleSnapshot = captureScheduleSnapshot(settings.Item, date, time, timing, iso)
  await client.send(new TransactWriteCommand({
    TransactItems: [
      { ConditionCheck: activeMembershipCondition(household) },
      { Put: {
        TableName: TABLE_NAME,
        Item: {
          PK:        household.partitionKey,
          SK:        sk,
          userId:    household.householdId,
          date,
          time,
          timing,
          source:    'alexa',
          ...(scheduleSnapshot ? { scheduleSnapshot } : {}),
          createdAt: iso,
          timeSource: minutesAgo === null ? 'recorded' : 'stated',
        },
      } },
    ],
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
