import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCognitoAuthorizationUrl,
  createWebSessionToken,
  exchangeCognitoAuthorizationCode,
  getCognitoWebConfiguration,
  makePkceChallenge,
  readWebSessionToken,
  verifyCognitoAccessToken,
} from '../src/lib/cognito-session.ts'

const env = {
  APP_ORIGIN: 'https://example.test',
  COGNITO_HOSTED_UI_HOST: 'example-auth.auth.us-east-1.amazoncognito.com',
  COGNITO_USER_POOL_ID: 'us-east-1_Abc123456',
  COGNITO_WEB_CLIENT_ID: '1234567890abcdefghij',
  MVP_SESSION_SECRET: 'a-session-secret-that-is-longer-than-thirty-two-characters',
  NODE_ENV: 'production',
}

test('Cognito configuration requires a fixed HTTPS origin and valid provider identifiers', () => {
  assert.deepEqual(getCognitoWebConfiguration(env), {
    appOrigin: 'https://example.test',
    clientId: '1234567890abcdefghij',
    hostedUiHost: 'example-auth.auth.us-east-1.amazoncognito.com',
    userPoolId: 'us-east-1_Abc123456',
  })
  assert.throws(
    () => getCognitoWebConfiguration({ ...env, APP_ORIGIN: 'http://example.test' }),
    /HTTPS/
  )
})

test('authorization URL uses code flow, PKCE, state, and the fixed callback', async () => {
  const challenge = await makePkceChallenge('synthetic-verifier-value')
  const url = buildCognitoAuthorizationUrl('synthetic-state', challenge, env)

  assert.equal(url.origin, 'https://example-auth.auth.us-east-1.amazoncognito.com')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.test/api/auth/callback')
  assert.equal(url.searchParams.get('state'), 'synthetic-state')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('code_challenge'), challenge)
})

test('authorization-code exchange sends PKCE without a client secret', async () => {
  let requestBody = ''
  const accessToken = await exchangeCognitoAuthorizationCode(
    'synthetic-code',
    'synthetic-verifier-value-that-is-long-enough-for-pkce',
    env,
    async (_input, init) => {
      requestBody = String(init?.body)
      return Response.json({ access_token: 'synthetic-access-token' })
    }
  )

  const params = new URLSearchParams(requestBody)
  assert.equal(accessToken, 'synthetic-access-token')
  assert.equal(params.get('grant_type'), 'authorization_code')
  assert.equal(params.get('code_verifier'), 'synthetic-verifier-value-that-is-long-enough-for-pkce')
  assert.equal(params.has('client_secret'), false)
})

test('verified Cognito subject is encrypted into an expiring application session', async () => {
  const subject = await verifyCognitoAccessToken(
    'synthetic-access-token',
    env,
    { async verify() { return { sub: 'provider-user-a' } } }
  )
  const now = Date.UTC(2026, 7, 1)
  const token = await createWebSessionToken(subject, env, now)
  const session = await readWebSessionToken(token, env, now + 1_000)

  assert.equal(session?.subject, 'provider-user-a')
  assert.equal(token.includes('provider-user-a'), false)
  assert.equal(await readWebSessionToken(token, env, now + 13 * 60 * 60 * 1_000), null)

  const parts = token.split('.')
  const ciphertext = parts[2]
  const changedCharacter = ciphertext[4] === 'a' ? 'b' : 'a'
  const tampered = `${parts[0]}.${parts[1]}.${ciphertext.slice(0, 4)}${changedCharacter}${ciphertext.slice(5)}`
  assert.equal(await readWebSessionToken(tampered, env, now + 1_000), null)
})
