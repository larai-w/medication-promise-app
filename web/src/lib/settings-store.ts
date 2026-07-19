import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from './dynamodb.ts'
import type { AuthenticatedHousehold } from './household.ts'
import {
  DEFAULT_MEDICATION_SETTINGS,
  parseMedicationSettingsInput,
  type MedicationSettings,
} from './settings.ts'

const SETTINGS_SK = 'SETTINGS#medication'

interface DynamoSettings extends MedicationSettings {
  PK: string
  SK: typeof SETTINGS_SK
  userId: string
}

function toSettings(item: unknown): MedicationSettings {
  if (!item) return DEFAULT_MEDICATION_SETTINGS
  const parsed = parseMedicationSettingsInput(item)
  const updatedAt = typeof (item as Record<string, unknown>).updatedAt === 'string'
    ? (item as Record<string, string>).updatedAt
    : undefined
  return { ...parsed, updatedAt }
}

export async function getMedicationSettings(
  household: AuthenticatedHousehold,
  client: { send(command: unknown): Promise<{ Item?: unknown }> } = docClient
): Promise<MedicationSettings> {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: household.partitionKey, SK: SETTINGS_SK },
  }))
  return toSettings(result.Item)
}

export async function putMedicationSettings(
  settings: MedicationSettings,
  household: AuthenticatedHousehold,
  client: { send(command: unknown): Promise<unknown> } = docClient
): Promise<MedicationSettings> {
  const now = new Date().toISOString()
  const item: DynamoSettings = {
    PK: household.partitionKey,
    SK: SETTINGS_SK,
    userId: household.householdId,
    medicationName: settings.medicationName,
    reminderSchedule: settings.reminderSchedule,
    updatedAt: now,
  }

  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))
  return { medicationName: item.medicationName, reminderSchedule: item.reminderSchedule, updatedAt: now }
}
