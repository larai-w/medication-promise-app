import { NextResponse } from 'next/server'
import { getWebAuthMode } from '@/lib/auth-mode'
import {
  buildCognitoAuthorizationUrl,
  makePkceChallenge,
  makeRandomToken,
  OAUTH_COOKIE_MAX_AGE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  getCognitoWebConfiguration,
} from '@/lib/cognito-session'

function loginUrl(error?: string) {
  const url = new URL('/login', getCognitoWebConfiguration().appOrigin)
  if (error) url.searchParams.set('error', error)
  return url
}

export async function GET(request: Request) {
  if (getWebAuthMode() !== 'cognito') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const state = makeRandomToken()
    const verifier = makeRandomToken(48)
    const response = NextResponse.redirect(
      buildCognitoAuthorizationUrl(state, await makePkceChallenge(verifier))
    )
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: OAUTH_COOKIE_MAX_AGE,
      path: '/',
      priority: 'high' as const,
    }
    response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions)
    response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieOptions)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    console.error('AUTH_OPERATIONAL_FAILURE Cognito login configuration error')
    try {
      return NextResponse.redirect(loginUrl('configuration'))
    } catch {
      return Response.json({ error: '認証設定を確認できません' }, { status: 503 })
    }
  }
}
