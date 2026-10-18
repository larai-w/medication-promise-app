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

// AWS is adding `acr` (string) and `amr` (string array) to Cognito tokens from
// 2026-11-04. Only `sub` is read, so unknown claims must pass through untouched.
test('claims with additive acr and amr still yield the subject', async () => {
  const verifier = {
    verify: async () => ({
      sub: SUBJECT_A,
      token_use: 'access',
      acr: 'synthetic-acr-value',
      amr: ['pwd', 'otp', 'mfa'],
    }),
  }
  const verifyLinkedToken = makeCognitoTokenVerifier({}, { verifier })
  assert.deepEqual(await verifyLinkedToken('any-token'), { subject: SUBJECT_A })
})

test('the real Cognito verifier accepts a signed access token carrying acr and amr', async () => {
  const { generateKeyPairSync, createSign } = await import('node:crypto')
  const { CognitoJwtVerifier } = await import('aws-jwt-verify')
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  // Synthetic identifiers only — never a real pool or client.
  const userPoolId = 'us-east-1_Abc123456'
  const clientId = '1234567890abcdefghij'
  const kid = 'synthetic-key'
  const now = Math.floor(Date.now() / 1_000)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const signingInput = `${encode({ alg: 'RS256', kid, typ: 'JWT' })}.${encode({
    sub: SUBJECT_A,
    iss: `https://cognito-idp.us-east-1.amazonaws.com/${userPoolId}`,
    client_id: clientId,
    token_use: 'access',
    scope: 'openid',
    auth_time: now,
    iat: now,
    exp: now + 300,
    jti: 'synthetic-jti',
    acr: 'synthetic-acr-value',
    amr: ['pwd', 'otp', 'mfa'],
  })}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey, 'base64url')

  const verifier = CognitoJwtVerifier.create({ userPoolId, tokenUse: 'access', clientId })
  verifier.cacheJwks({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] })

  const verifyLinkedToken = makeCognitoTokenVerifier({}, { verifier })
  assert.deepEqual(await verifyLinkedToken(`${signingInput}.${signature}`), { subject: SUBJECT_A })
})
