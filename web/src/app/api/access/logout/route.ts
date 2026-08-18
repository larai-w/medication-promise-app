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
  // ログアウトで消すのは Cognito のセッションだけにする。
  // 従来は招待コードの印(MVP_ACCESS_COOKIE)も一緒に消しており、アカウントを
  // 切り替えたいだけでも招待コードから入り直しになっていた。招待コードは
  // 「このサイトに入ってよい人か」を示すもので、「今誰がログインしているか」
  // とは別の層。完全に離脱したい場合は ?full=1 を付ける。
  const clearAccessGate = new URL(request.url).searchParams.get('full') === '1'
  if (clearAccessGate) {
    response.cookies.set(MVP_ACCESS_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
  }
  response.cookies.set(WEB_SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
  response.cookies.set(OAUTH_STATE_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
  response.cookies.set(OAUTH_VERIFIER_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
