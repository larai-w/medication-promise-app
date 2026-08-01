import { NextResponse } from 'next/server'
import { getWebAuthMode } from '@/lib/auth-mode'
import {
  getCognitoWebConfiguration,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  WEB_SESSION_COOKIE,
} from '@/lib/cognito-session'
import { MVP_ACCESS_COOKIE } from '@/lib/mvp-access'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const cognitoConfig = getWebAuthMode() === 'cognito'
    ? getCognitoWebConfiguration()
    : null
  const expectedOrigin = cognitoConfig?.appOrigin ?? new URL(request.url).origin
  if (origin && origin !== expectedOrigin) {
    return Response.json({ error: '不正なリクエストです' }, { status: 403 })
  }

  let destination = new URL('/login', expectedOrigin)
  if (cognitoConfig) {
    destination = new URL(`https://${cognitoConfig.hostedUiHost}/logout`)
    destination.searchParams.set('client_id', cognitoConfig.clientId)
    destination.searchParams.set('logout_uri', `${cognitoConfig.appOrigin}/login`)
  }

  const response = NextResponse.redirect(destination, 303)
  response.cookies.set(MVP_ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  response.cookies.set(WEB_SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
  response.cookies.set(OAUTH_STATE_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
  response.cookies.set(OAUTH_VERIFIER_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
