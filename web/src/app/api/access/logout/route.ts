import { NextResponse } from 'next/server'
import { MVP_ACCESS_COOKIE } from '@/lib/mvp-access'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: '不正なリクエストです' }, { status: 403 })
  }

  const response = NextResponse.redirect(new URL('/login', request.url), 303)
  response.cookies.set(MVP_ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  return response
}
