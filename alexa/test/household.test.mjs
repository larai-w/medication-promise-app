import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AlexaHouseholdError,
  HOUSEHOLD_FAILURE,
  extractLinkedToken,
  makeHouseholdPK,
  resolveAlexaHousehold,
} from '../household.mjs'

// Synthetic identities only — never real Amazon accounts, tokens, or households.
const SUBJECT_A = 'provider-user-a'

function linkedEvent(accessToken) {
  return {
    request: { type: 'IntentRequest', intent: { name: 'RecordMorningIntent' } },
    context: { System: { user: { accessToken } } },
  }
}

const verifierFor = (subject) => async () => ({ subject })

test('extractLinkedToken reads the context token, then the session token', () => {
  assert.equal(extractLinkedToken(linkedEvent('ctx')), 'ctx')
  assert.equal(
    extractLinkedToken({ session: { user: { accessToken: 'sess' } } }),
    'sess'
  )
  assert.equal(extractLinkedToken({}), undefined)
})

test('missing linked token fails closed and asks the user to link', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent(undefined), {}),
    (err) => {
      assert.ok(err instanceof AlexaHouseholdError)
      assert.equal(err.reason, HOUSEHOLD_FAILURE.NO_TOKEN)
      assert.match(err.speech, /アカウントリンク/)
      return true
    }
  )
})

test('invalid or expired token fails closed and asks the user to relink', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent('bad'), {
      verifyLinkedToken: async () => {
        throw new Error('signature check failed')
      },
    }),
    (err) => {
      assert.equal(err.reason, HOUSEHOLD_FAILURE.INVALID_TOKEN)
      assert.match(err.speech, /リンクし直/)
      return true
    }
  )
})

test('token without a subject fails closed as invalid', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent('t'), { verifyLinkedToken: async () => ({}) }),
    (err) => err.reason === HOUSEHOLD_FAILURE.INVALID_TOKEN
  )
})

test('valid token with one active membership resolves the household partition', async () => {
  const household = await resolveAlexaHousehold(linkedEvent('good'), {
    verifyLinkedToken: verifierFor(SUBJECT_A),
    getMembershipsBySubject: async (subject) => {
      assert.equal(subject, SUBJECT_A)
      return [{ householdId: 'household-a', status: 'active' }]
    },
  })

  assert.deepEqual(household, {
    householdId: 'household-a',
    providerSubject: SUBJECT_A,
    partitionKey: 'HOUSEHOLD#household-a',
  })
  assert.equal(household.partitionKey, makeHouseholdPK('household-a'))
  // No production path should resolve the legacy global partition.
  assert.doesNotMatch(household.partitionKey, /USER#default-user/)
})

test('membership without an explicit status is treated as active', async () => {
  const household = await resolveAlexaHousehold(linkedEvent('good'), {
    verifyLinkedToken: verifierFor(SUBJECT_A),
    getMembershipsBySubject: async () => [{ householdId: 'household-a' }],
  })
  assert.equal(household.householdId, 'household-a')
})

test('no membership fails closed as not-yet-invited', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent('good'), {
      verifyLinkedToken: verifierFor(SUBJECT_A),
      getMembershipsBySubject: async () => [],
    }),
    (err) => {
      assert.equal(err.reason, HOUSEHOLD_FAILURE.NO_MEMBERSHIP)
      assert.match(err.speech, /招待/)
      return true
    }
  )
})

test('only-disabled memberships fail closed as household-disabled', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent('good'), {
      verifyLinkedToken: verifierFor(SUBJECT_A),
      getMembershipsBySubject: async () => [
        { householdId: 'household-a', status: 'disabled' },
      ],
    }),
    (err) => err.reason === HOUSEHOLD_FAILURE.HOUSEHOLD_DISABLED
  )
})

test('multiple active memberships fail closed as ambiguous', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent('good'), {
      verifyLinkedToken: verifierFor(SUBJECT_A),
      getMembershipsBySubject: async () => [
        { householdId: 'household-a', status: 'active' },
        { householdId: 'household-b', status: 'active' },
      ],
    }),
    (err) => {
      assert.equal(err.reason, HOUSEHOLD_FAILURE.AMBIGUOUS_MEMBERSHIP)
      // Generic copy: must not leak either household identifier.
      assert.doesNotMatch(err.speech, /household-a|household-b/)
      return true
    }
  )
})

test('a membership lookup failure returns a retry-safe generic error', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent('good'), {
      verifyLinkedToken: verifierFor(SUBJECT_A),
      getMembershipsBySubject: async () => {
        throw new Error('DynamoDB unavailable')
      },
    }),
    (err) => err.reason === HOUSEHOLD_FAILURE.LOOKUP_ERROR
  )
})

test('the default resolver fails closed when no verifier is configured', async () => {
  await assert.rejects(
    resolveAlexaHousehold(linkedEvent('good')),
    (err) => err.reason === HOUSEHOLD_FAILURE.INVALID_TOKEN
  )
})
