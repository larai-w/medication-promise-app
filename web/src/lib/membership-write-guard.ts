import { TABLE_NAME } from './dynamodb.ts'
import type { AuthenticatedHousehold } from './household.ts'

export function activeMembershipCondition(household: AuthenticatedHousehold) {
  if (
    household.partitionMode !== 'household'
    || typeof household.providerSubject !== 'string'
    || !household.providerSubject
  ) {
    throw new Error('Household mutation requires a verified provider subject')
  }

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
