import { NextResponse, type NextRequest } from 'next/server.js'
import {
  isAccessGateEnabled,
  isAccessTokenValid,
  MVP_ACCESS_COOKIE,
} from './lib/mvp-access.ts'
import { getWebAuthMode } from './lib/auth-mode.ts'
import { readWebSessionToken, WEB_SESSION_COOKIE } from './lib/cognito-session.ts'

const PUBLIC_PATHS = [
  '/login',
  '/privacy',
  '/terms',
  '/robots.txt',
  '/api/access/login',
  '/api/auth/login',
  '/api/auth/callback',
]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  if (getWebAuthMode() === 'mvp') {
    if (!isAccessGateEnabled()) return NextResponse.next()
    const token = request.cookies.get(MVP_ACCESS_COOKIE)?.value
    if (await isAccessTokenValid(token)) return NextResponse.next()
  } else {
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value
    if (await readWebSessionToken(token)) return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'この記録にアクセスするにはログインが必要です' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
}
