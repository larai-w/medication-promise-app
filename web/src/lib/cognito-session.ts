import { CognitoJwtVerifier } from 'aws-jwt-verify'

type AuthEnvironment = Record<string, string | undefined>

export const WEB_SESSION_COOKIE = 'medication_promise_session'
export const OAUTH_STATE_COOKIE = 'medication_promise_oauth_state'
export const OAUTH_VERIFIER_COOKIE = 'medication_promise_oauth_verifier'
export const WEB_SESSION_MAX_AGE = 60 * 60 * 12
export const OAUTH_COOKIE_MAX_AGE = 60 * 10

const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
const HOST_PATTERN = /^[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/

export interface CognitoWebConfiguration {
  appOrigin: string
  clientId: string
  hostedUiHost: string
  userPoolId: string
}

interface WebSession {
  expiresAt: number
  subject: string
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function requireSessionSecret(env: AuthEnvironment) {
  const secret = env.MVP_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('MVP_SESSION_SECRET must be at least 32 characters')
  }
  return secret
}

async function sessionKey(env: AuthEnvironment) {
  const encoded = new TextEncoder().encode(requireSessionSecret(env))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function getCognitoWebConfiguration(
  env: AuthEnvironment = process.env
): CognitoWebConfiguration {
  const appOrigin = env.APP_ORIGIN
  const clientId = env.COGNITO_WEB_CLIENT_ID
  const hostedUiHost = env.COGNITO_HOSTED_UI_HOST
  const userPoolId = env.COGNITO_USER_POOL_ID

  if (!appOrigin || !clientId || !hostedUiHost || !userPoolId) {
    throw new Error('Cognito Web authentication is not fully configured')
  }

  const origin = new URL(appOrigin)
  if (origin.origin !== appOrigin || (env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN must be an origin and use HTTPS in production')
  }
  if (!HOST_PATTERN.test(hostedUiHost)) {
    throw new Error('COGNITO_HOSTED_UI_HOST is invalid')
  }
  if (!/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/.test(userPoolId)) {
    throw new Error('COGNITO_USER_POOL_ID is invalid')
  }
  if (!/^[a-z0-9]{10,128}$/.test(clientId)) {
    throw new Error('COGNITO_WEB_CLIENT_ID is invalid')
  }

  return { appOrigin, clientId, hostedUiHost, userPoolId }
}

export function makeRandomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

export async function makePkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return encodeBase64Url(new Uint8Array(digest))
}

export function buildCognitoAuthorizationUrl(
  state: string,
  codeChallenge: string,
  env: AuthEnvironment = process.env
) {
  const config = getCognitoWebConfiguration(env)
  const url = new URL(`https://${config.hostedUiHost}/oauth2/authorize`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid')
  url.searchParams.set('redirect_uri', `${config.appOrigin}/api/auth/callback`)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', codeChallenge)
  return url
}

export async function exchangeCognitoAuthorizationCode(
  code: string,
  verifier: string,
  env: AuthEnvironment = process.env,
  fetchImpl: typeof fetch = fetch
) {
  if (!code || code.length > 2_048 || verifier.length < 43 || verifier.length > 128) {
    throw new Error('Cognito authorization response is invalid')
  }
  const config = getCognitoWebConfiguration(env)
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: `${config.appOrigin}/api/auth/callback`,
  })
  const response = await fetchImpl(`https://${config.hostedUiHost}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Cognito authorization-code exchange failed')
  const tokens = await response.json() as { access_token?: unknown }
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
    throw new Error('Cognito token response has no access token')
  }
  return tokens.access_token
}

export async function verifyCognitoAccessToken(
  token: string,
  env: AuthEnvironment = process.env,
  verifier?: { verify(value: string): Promise<{ sub?: unknown }> }
) {
  const config = getCognitoWebConfiguration(env)
  const tokenVerifier = verifier ?? CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: 'access',
    clientId: config.clientId,
  })
  const claims = await tokenVerifier.verify(token)
  const subject = typeof claims.sub === 'string' ? claims.sub.trim() : ''
  if (!SUBJECT_PATTERN.test(subject)) throw new Error('Verified Cognito token has no valid subject')
  return subject
}

export async function createWebSessionToken(
  subject: string,
  env: AuthEnvironment = process.env,
  now = Date.now()
) {
  if (!SUBJECT_PATTERN.test(subject)) throw new Error('Cannot create a session without a valid subject')
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const session: WebSession = {
    expiresAt: now + WEB_SESSION_MAX_AGE * 1000,
    subject,
  }
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sessionKey(env),
    new TextEncoder().encode(JSON.stringify(session))
  )
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`
}

export async function readWebSessionToken(
  token: string | undefined,
  env: AuthEnvironment = process.env,
  now = Date.now()
): Promise<WebSession | null> {
  if (!token) return null
  const [version, encodedIv, encodedCiphertext] = token.split('.')
  if (version !== 'v1' || !encodedIv || !encodedCiphertext) return null

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64Url(encodedIv) },
      await sessionKey(env),
      decodeBase64Url(encodedCiphertext)
    )
    const session = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<WebSession>
    if (
      typeof session.subject !== 'string'
      || !SUBJECT_PATTERN.test(session.subject)
      || typeof session.expiresAt !== 'number'
      || session.expiresAt <= now
    ) return null
    return { subject: session.subject, expiresAt: session.expiresAt }
  } catch {
    return null
  }
}
