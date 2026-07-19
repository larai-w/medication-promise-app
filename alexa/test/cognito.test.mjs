import assert from 'node:assert/strict'
import test from 'node:test'
import { makeCognitoTokenVerifier } from '../cognito.mjs'
import { resolveAlexaHousehold } from '../household.mjs'

// Synthetic subject only — never a real Cognito sub.
const SUBJECT_A = 'provider-user-a'

test('extracts the subject from verified Cognito claims', async () => {
  const verifier = { verify: async () => ({ sub: SUBJECT_A, token_use: 'access' }) }
  const verifyLinkedToken = makeCognitoTokenVerifier({}, { verifier })
  assert.deepEqual(await verifyLinkedToken('any-token'), { subject: SUBJECT_A })
})

test('a failed verification throws (mapped to invalid-token upstream)', async () => {
  const verifier = {
    verify: async () => {
      throw new Error('JwtExpiredError')
    },
  }
  const verifyLinkedToken = makeCognitoTokenVerifier({}, { verifier })
  await assert.rejects(verifyLinkedToken('expired'))
})

test('claims without a subject yield an empty subject (invalid-token upstream)', async () => {
  const verifier = { verify: async () => ({ token_use: 'access' }) }
  const verifyLinkedToken = makeCognitoTokenVerifier({}, { verifier })
  assert.deepEqual(await verifyLinkedToken('t'), { subject: '' })
})

test('unconfigured default verifier fails closed (no pool env)', async () => {
  const verifyLinkedToken = makeCognitoTokenVerifier({})
  await assert.rejects(verifyLinkedToken('t'), /COGNITO_USER_POOL_ID/)
})

test('composes with resolveAlexaHousehold end to end (verifier + lookup)', async () => {
  const verifier = { verify: async () => ({ sub: SUBJECT_A }) }
  const household = await resolveAlexaHousehold(
    { context: { System: { user: { accessToken: 'good' } } } },
    {
      verifyLinkedToken: makeCognitoTokenVerifier({}, { verifier }),
      getMembershipsBySubject: async (subject) => {
        assert.equal(subject, SUBJECT_A)
        return [{ householdId: 'household-a', status: 'active' }]
      },
    }
  )
  assert.equal(household.partitionKey, 'HOUSEHOLD#household-a')
})

test('an expired token composes into an invalid-token household failure', async () => {
  const verifier = {
    verify: async () => {
      throw new Error('JwtExpiredError')
    },
  }
  await assert.rejects(
    resolveAlexaHousehold(
      { context: { System: { user: { accessToken: 'expired' } } } },
      {
        verifyLinkedToken: makeCognitoTokenVerifier({}, { verifier }),
        getMembershipsBySubject: async () => [],
      }
    ),
    (err) => err.reason === 'invalid-token'
  )
})
