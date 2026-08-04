import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from './dynamodb.ts'

const HOUSEHOLD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/
const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

export interface HouseholdMembership {
  householdId: string
  status: 'active' | 'disabled' | 'deleting'
}

interface MembershipItem {
  SK?: unknown
  householdId?: unknown
  status?: unknown
}

export async function getHouseholdMembershipsBySubject(
  subject: string,
  client: { send(command: unknown): Promise<{ Items?: unknown[] }> } = docClient
): Promise<HouseholdMembership[]> {
  if (!SUBJECT_PATTERN.test(subject)) throw new Error('Provider subject is invalid')

  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${subject}`,
      ':prefix': 'MEMBERSHIP#',
    },
    ConsistentRead: true,
  }))

  return (result.Items ?? []).flatMap((rawItem) => {
    const item = rawItem as MembershipItem
    const fromSortKey = typeof item.SK === 'string' && item.SK.startsWith('MEMBERSHIP#')
      ? item.SK.slice('MEMBERSHIP#'.length)
      : ''
    const fromAttribute = typeof item.householdId === 'string' ? item.householdId : ''
    if (fromAttribute && fromSortKey && fromAttribute !== fromSortKey) return []
    const householdId = fromAttribute || fromSortKey
    if (!HOUSEHOLD_ID_PATTERN.test(householdId)) return []
    if (
      item.status !== undefined
      && item.status !== 'active'
      && item.status !== 'disabled'
      && item.status !== 'deleting'
    ) {
      return []
    }
    const status = item.status === 'disabled' || item.status === 'deleting'
      ? item.status
      : 'active'
    return [{ householdId, status }]
  })
}
