import { NextRequest, NextResponse } from 'next/server'
import { getWebAuthMode } from '@/lib/auth-mode'
import {
  createWebSessionToken,
  exchangeCognitoAuthorizationCode,
  getCognitoWebConfiguration,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  verifyCognitoAccessToken,
  WEB_SESSION_COOKIE,
  WEB_SESSION_MAX_AGE,
} from '@/lib/cognito-session'

function clearTemporaryCookies(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, '', { maxAge: 0, path: '/' })
  response.cookies.set(OAUTH_VERIFIER_COOKIE, '', { maxAge: 0, path: '/' })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function appUrl(path: string) {
  return new URL(path, getCognitoWebConfiguration().appOrigin)
}

function failedCallback() {
  return clearTemporaryCookies(
    NextResponse.redirect(appUrl('/login?error=authentication'))
  )
}

export async function GET(request: NextRequest) {
  if (getWebAuthMode() !== 'cognito') {
    return Response.json({ error: '認証方式が無効です' }, { status: 404 })
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return failedCallback()
  }

  try {
    const accessToken = await exchangeCognitoAuthorizationCode(code, verifier)
    const subject = await verifyCognitoAccessToken(accessToken)
    const response = clearTemporaryCookies(
      NextResponse.redirect(appUrl('/'))
    )
    response.cookies.set(WEB_SESSION_COOKIE, await createWebSessionToken(subject), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: WEB_SESSION_MAX_AGE,
      path: '/',
      priority: 'high',
    })
    return response
  } catch {
    console.error('AUTH_OPERATIONAL_FAILURE Cognito callback failed')
    return failedCallback()
  }
}
