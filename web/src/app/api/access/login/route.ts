import { NextResponse } from 'next/server'
import { getWebAuthMode } from '@/lib/auth-mode'
import {
  createAccessToken,
  getAccessConfigurationError,
  isAccessCodeValid,
  MVP_ACCESS_COOKIE,
  MVP_ACCESS_MAX_AGE,
} from '@/lib/mvp-access'

export async function POST(request: Request) {
  if (getWebAuthMode() !== 'mvp') {
    return Response.json({ error: 'このログイン方法は利用できません' }, { status: 404 })
  }

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: '不正なリクエストです' }, { status: 403 })
  }

  const configurationError = getAccessConfigurationError()
  if (configurationError) {
    console.error('MVP access gate configuration error:', configurationError)
    return Response.json(
      { error: '現在ログインを利用できません。管理者へご連絡ください。' },
      { status: 503 }
    )
  }

  let body: { accessCode?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'アクセスコードを入力してください' }, { status: 400 })
  }

  if (!(await isAccessCodeValid(body.accessCode))) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return Response.json({ error: 'アクセスコードが違います' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(MVP_ACCESS_COOKIE, await createAccessToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: MVP_ACCESS_MAX_AGE,
    path: '/',
    priority: 'high',
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
