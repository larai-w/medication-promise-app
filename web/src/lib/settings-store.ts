import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '@/lib/dynamodb'
import type { AuthenticatedHousehold } from '@/lib/household'
import {
  DEFAULT_MEDICATION_SETTINGS,
  parseMedicationSettingsInput,
  type MedicationSettings,
} from '@/lib/settings'

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

export async function getMedicationSettings(household: AuthenticatedHousehold): Promise<MedicationSettings> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: household.partitionKey, SK: SETTINGS_SK },
  }))
  return toSettings(result.Item)
}

export async function putMedicationSettings(
  settings: MedicationSettings,
  household: AuthenticatedHousehold
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

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))
  return { medicationName: item.medicationName, reminderSchedule: item.reminderSchedule, updatedAt: now }
}
