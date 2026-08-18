import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

// ログアウトは Cognito のセッションだけを消す。招待コードの印は残す。
// 従来は一緒に消しており、アカウントを切り替えたいだけでも招待コードから
// 入り直しになっていた。招待コードは「このサイトに入ってよい人か」を示すもので、
// 「今誰がログインしているか」とは別の層。
test('logout clears the Cognito session but keeps the access gate cookie', async () => {
  const source = await readFile(
    new URL('../src/app/api/access/logout/route.ts', import.meta.url),
    'utf8'
  )
  // 招待コードの削除は ?full=1 のときだけ
  assert.match(
    source,
    /const clearAccessGate = new URL\(request\.url\)\.searchParams\.get\('full'\) === '1'/,
    '完全離脱の分岐がない'
  )
  assert.match(source, /if \(clearAccessGate\) \{/, '招待コードの削除が無条件になっている')
  // Cognito セッションは常に消す
  assert.match(
    source,
    /response\.cookies\.set\(WEB_SESSION_COOKIE, '', \{ httpOnly: true, maxAge: 0/,
    'Cognito セッションが消されていない'
  )
})

// 入口の Cookie は strict にしない。外部リンクから開いた初回で送られず、
// 招待コードを何度も聞かれる原因になる。これ単体では何も操作できない。
test('the access cookie uses lax so external links do not re-prompt', async () => {
  const source = await readFile(
    new URL('../src/app/api/access/login/route.ts', import.meta.url),
    'utf8'
  )
  assert.match(source, /sameSite: 'lax'/, 'sameSite が lax でない')
  assert.equal(source.includes("sameSite: 'strict'"), false, 'strict が残っている')
})
