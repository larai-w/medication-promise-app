import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAccessToken,
  getAccessConfigurationError,
  isAccessCodeValid,
  isAccessGateEnabled,
  isAccessTokenValid,
  readCookie,
} from '../src/lib/mvp-access.ts'

const configuredEnv = {
  NODE_ENV: 'production',
  MVP_ACCESS_CODE: 'family-access-code-1234',
  MVP_SESSION_SECRET: 'a-session-secret-that-is-longer-than-thirty-two-characters',
}

test('access gate is convenient in development and fail-closed in production', () => {
  assert.equal(isAccessGateEnabled({ NODE_ENV: 'development' }), false)
  assert.equal(isAccessGateEnabled({ NODE_ENV: 'production' }), true)
  assert.match(getAccessConfigurationError({ NODE_ENV: 'production' }) ?? '', /MVP_ACCESS_CODE/)
})

test('valid access code creates a verifiable session token', async () => {
  assert.equal(await isAccessCodeValid(configuredEnv.MVP_ACCESS_CODE, configuredEnv), true)
  assert.equal(await isAccessCodeValid('wrong-access-code', configuredEnv), false)

  const token = await createAccessToken(configuredEnv)
  assert.equal(await isAccessTokenValid(token, configuredEnv), true)
  assert.equal(await isAccessTokenValid(`${token}tampered`, configuredEnv), false)
})

test('cookie parser handles multiple cookies without exposing other values', () => {
  assert.equal(readCookie('theme=dark; session=expected%20value; other=1', 'session'), 'expected value')
  assert.equal(readCookie('theme=dark', 'session'), undefined)
})
