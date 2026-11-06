import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb'
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

type DeletionQueryPage = {
  Items?: unknown[]
  LastEvaluatedKey?: Record<string, unknown>
}

function scriptedDeletionClient(
  initialItems: Array<{ PK: string; SK: string }>,
  queryPage: (input: QueryCommandInput, remaining: Array<{ PK: string; SK: string }>) => DeletionQueryPage
) {
  const client = deletionClient(initialItems)
  return {
    calls: client.calls,
    remaining: client.remaining,
    async send(command: unknown) {
      if (command instanceof QueryCommand) {
        client.calls.push({ name: 'QueryCommand', input: command.input as Record<string, unknown> })
        return queryPage(command.input, client.remaining())
      }
      return client.send(command)
    },
  }
}

test('an empty terminal query key finishes each deletion check without another query', async () => {
  let queries = 0
  const client = scriptedDeletionClient([], (input) => {
    queries++
    assert.ok(queries <= 3, 'synthetic query cap: empty terminal key caused an extra request')
    assert.equal(input.ExclusiveStartKey, undefined)
    return { Items: [], LastEvaluatedKey: {} }
  })

  assert.deepEqual(await deleteHouseholdAccountData(householdContext(), client), { success: true })

  assert.equal(queries, 3)
  assert.deepEqual(client.calls.map(({ name }) => name), [
    'UpdateCommand', 'QueryCommand', 'QueryCommand', 'QueryCommand', 'DeleteCommand',
  ])
})

test('deletion follows continuation once and stops on the final empty key map', async () => {
  const first = { PK: 'HOUSEHOLD#household-a', SK: 'RECORD#2035-01-01T08:00:00#synthetic-a' }
  const second = { PK: 'HOUSEHOLD#household-a', SK: 'SETTINGS#medication' }
  const other = { PK: 'HOUSEHOLD#household-b', SK: 'RECORD#2035-01-01T08:00:00#synthetic-b' }
  let queries = 0
  const client = scriptedDeletionClient([first, second, other], (input, remaining) => {
    queries++
    assert.ok(queries <= 5, 'synthetic query cap: terminal page caused an extra request')
    assert.equal(input.ConsistentRead, true)
    assert.equal(input.ProjectionExpression, 'PK, SK')
    assert.deepEqual(input.ExpressionAttributeValues, { ':pk': first.PK })
    const own = remaining.filter(({ PK }) => PK === first.PK)
    if (input.ExclusiveStartKey) {
      assert.deepEqual(input.ExclusiveStartKey, first)
      return { Items: own.slice(1), LastEvaluatedKey: {} }
    }
    return own.length > 0
      ? { Items: own.slice(0, 1), LastEvaluatedKey: first }
      : { Items: [], LastEvaluatedKey: {} }
  })

  assert.deepEqual(await deleteHouseholdAccountData(householdContext(), client), { success: true })

  assert.equal(queries, 5)
  assert.deepEqual(client.remaining(), [other])
  assert.equal(client.calls.filter(({ name }) => name === 'BatchWriteCommand').length, 1)
  assert.equal(client.calls.at(-1)?.name, 'DeleteCommand')
})

for (const reordered of [false, true]) {
  test(`repeated empty-page cursor aborts before data or membership deletion${reordered ? ' despite key reordering' : ''}`, async () => {
    let queries = 0
    const cursor = { PK: 'HOUSEHOLD#household-a', SK: 'RECORD#synthetic-cursor' }
    const client = scriptedDeletionClient([], () => {
      queries++
      assert.ok(queries <= 2, 'synthetic query cap: cursor cycle was not rejected')
      return {
        Items: [],
        LastEvaluatedKey: reordered && queries === 2
          ? { SK: cursor.SK, PK: cursor.PK }
          : { ...cursor },
      }
    })

    await assert.rejects(deleteHouseholdAccountData(householdContext(), client), /repeated.*cursor/i)

    assert.equal(queries, 2)
    assert.deepEqual(client.calls.map(({ name }) => name), ['UpdateCommand', 'QueryCommand', 'QueryCommand'])
    const lock = client.calls[0].input.ExpressionAttributeValues as Record<string, unknown>
    assert.equal(lock[':deleting'], 'deleting')
  })
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
