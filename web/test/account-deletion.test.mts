import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  deleteHouseholdAccountData,
  type AccountDeletionContext,
} from '../src/lib/account-deletion.ts'
import { makeAccountDeletionHandlers } from '../src/lib/account-deletion-handler.ts'
import { makeAuthenticatedHousehold } from '../src/lib/household.ts'

function householdContext(householdId = 'household-a', subject = 'provider-user-a') {
  return {
    household: {
      ...makeAuthenticatedHousehold({
        HOUSEHOLD_ID: householdId,
        HOUSEHOLD_PARTITION_MODE: 'household',
      }),
      providerSubject: subject,
    },
    providerSubject: subject,
  }
}

function deletionClient(initialItems: Array<{ PK: string; SK: string }>) {
  let items = [...initialItems]
  const calls: Array<{ name: string; input: Record<string, unknown> }> = []
  return {
    calls,
    remaining: () => items,
    async send(command: unknown) {
      const typed = command as { constructor: { name: string }; input: Record<string, unknown> }
      const name = typed.constructor.name
      calls.push({ name, input: typed.input })
      if (name === 'QueryCommand') {
        const values = typed.input.ExpressionAttributeValues as Record<string, string>
        return { Items: items.filter((item) => item.PK === values[':pk']) }
      }
      if (name === 'BatchWriteCommand') {
        const requestItems = typed.input.RequestItems as Record<
          string,
          Array<{ DeleteRequest: { Key: { PK: string; SK: string } } }>
        >
        const deleted = Object.values(requestItems).flat().map(({ DeleteRequest }) => DeleteRequest.Key)
        items = items.filter((item) => !deleted.some((key) => key.PK === item.PK && key.SK === item.SK))
        return { UnprocessedItems: {} }
      }
      return {}
    },
  }
}

test('household deletion removes only the resolved partition before its membership', async () => {
  const client = deletionClient([
    { PK: 'HOUSEHOLD#household-a', SK: 'RECORD#2035-01-01T08:00:00#synthetic-a' },
    { PK: 'HOUSEHOLD#household-a', SK: 'SETTINGS#medication' },
    { PK: 'HOUSEHOLD#household-a', SK: 'ALEXA_LINK#synthetic-provider' },
    { PK: 'HOUSEHOLD#household-b', SK: 'RECORD#2035-01-01T08:00:00#synthetic-b' },
  ])

  await deleteHouseholdAccountData(householdContext(), client)

  assert.deepEqual(client.remaining(), [
    { PK: 'HOUSEHOLD#household-b', SK: 'RECORD#2035-01-01T08:00:00#synthetic-b' },
  ])
  const membershipDelete = client.calls.at(-1)
  assert.equal(membershipDelete?.name, 'DeleteCommand')
  assert.deepEqual(membershipDelete?.input.Key, {
    PK: 'USER#provider-user-a',
    SK: 'MEMBERSHIP#household-a',
  })
})

test('household deletion rejects an unverified or mismatched subject', async () => {
  const context = householdContext()
  await assert.rejects(
    deleteHouseholdAccountData({ ...context, providerSubject: 'provider-user-b' }, deletionClient([])),
    /verified household identity/
  )
})

test('deletion API ignores client household input and uses server membership', async () => {
  let deletedContext: AccountDeletionContext | undefined
  const handlers = makeAccountDeletionHandlers({
    env: {
      ACCOUNT_DELETION_ENABLED: 'true',
      APP_ORIGIN: 'https://example.test',
      WEB_AUTH_MODE: 'cognito',
      HOUSEHOLD_PARTITION_MODE: 'household',
    },
    readSession: async () => ({ subject: 'provider-user-a', expiresAt: Date.now() + 60_000 }),
    getMemberships: async () => [{ householdId: 'household-a', status: 'active' }],
    deleteData: async (context) => {
      deletedContext = context
      return { success: true }
    },
  })

  const response = await handlers.DELETE(new Request('https://example.test/api/account/data', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'medication_promise_session=synthetic-session',
      Origin: 'https://example.test',
    },
    body: JSON.stringify({
      householdId: 'household-b',
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      understandsRecovery: true,
      understandsExternalData: true,
    }),
  }))

  assert.equal(response.status, 200)
  assert.equal(deletedContext?.household.householdId, 'household-a')
  assert.equal(deletedContext?.providerSubject, 'provider-user-a')
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/)
})

test('deletion API is fail-closed when disabled or cross-origin', async () => {
  let deleted = false
  const disabled = makeAccountDeletionHandlers({
    env: { ACCOUNT_DELETION_ENABLED: 'false' },
    deleteData: async () => { deleted = true; return { success: true } },
  })
  const disabledResponse = await disabled.DELETE(new Request('https://example.test/api/account/data', {
    method: 'DELETE',
  }))
  assert.equal(disabledResponse.status, 503)

  const enabled = makeAccountDeletionHandlers({
    env: { ACCOUNT_DELETION_ENABLED: 'true', APP_ORIGIN: 'https://example.test' },
    deleteData: async () => { deleted = true; return { success: true } },
  })
  const crossOriginResponse = await enabled.DELETE(new Request('https://example.test/api/account/data', {
    method: 'DELETE',
    headers: { Origin: 'https://attacker.test' },
  }))
  assert.equal(crossOriginResponse.status, 403)
  assert.equal(deleted, false)
})
