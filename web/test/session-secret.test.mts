// セッション署名鍵の解決を固定する。
//
// 2026-08-18 に、本番 Lambda の環境変数が MVP_SESSION_SECRET_ARN に手作業で
// 差し替えられていた一方、コードは MVP_SESSION_SECRET しか読まない状態だった。
// ログインしようとした瞬間に落ちる状態で、しかも次の sst deploy で環境変数が
// 平文に巻き戻る構造になっていた。同じ形を二度と作らないための固定。

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolveSessionSecret,
  getSessionSecretConfigurationError,
  resetSessionSecretCache,
} from '../src/lib/session-secret.ts'

const VALID = 'a'.repeat(32)

test('環境変数に鍵の実体があればそれを使う（ローカル・テスト用）', async () => {
  resetSessionSecretCache()
  const secret = await resolveSessionSecret({ MVP_SESSION_SECRET: VALID })
  assert.equal(secret, VALID)
})

test('32文字未満の鍵は拒否する', async () => {
  resetSessionSecretCache()
  await assert.rejects(
    () => resolveSessionSecret({ MVP_SESSION_SECRET: 'short' }),
    /at least 32 characters/
  )
})

test('鍵も ARN も無ければ例外。黙って通さない', async () => {
  resetSessionSecretCache()
  await assert.rejects(
    () => resolveSessionSecret({}),
    /MVP_SESSION_SECRET or MVP_SESSION_SECRET_ARN/
  )
})

test('ARN だけの構成を設定エラーにしない（本番の形）', () => {
  assert.equal(
    getSessionSecretConfigurationError({ MVP_SESSION_SECRET_ARN: 'arn:aws:secretsmanager:x' }),
    null
  )
})

test('鍵も ARN も無い構成は設定エラーとして報告する', () => {
  const error = getSessionSecretConfigurationError({})
  assert.match(String(error), /must be set/)
})

test('短すぎる鍵は設定エラーとして報告する', () => {
  const error = getSessionSecretConfigurationError({ MVP_SESSION_SECRET: 'short' })
  assert.match(String(error), /at least 32 characters/)
})

// 実装が「環境変数に平文を置く」形へ戻っていないことを、
// 呼び出し側のソースそのもので確かめる。テストだけ通って本体が
// 元に戻っている、という状態を防ぐ。
test('cognito-session は鍵を環境変数から直接読まない', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/lib/cognito-session.ts', import.meta.url), 'utf8')
  )
  assert.ok(
    source.includes('resolveSessionSecret'),
    'cognito-session.ts は resolveSessionSecret を経由すること'
  )
  assert.ok(
    !source.includes('env.MVP_SESSION_SECRET'),
    'cognito-session.ts が env.MVP_SESSION_SECRET を直接読んでいる'
  )
})

test('mvp-access は鍵を環境変数から直接読まない', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/lib/mvp-access.ts', import.meta.url), 'utf8')
  )
  assert.ok(source.includes('resolveSessionSecret'))
  // isAccessGateEnabled は「設定されているか」を見るだけなので参照してよい。
  // 鍵として使う箇所（hmacHex の引数）に env が渡っていないことを見る。
  assert.ok(
    !/hmacHex\([^)]*env\.MVP_SESSION_SECRET/.test(source),
    'hmacHex に環境変数の鍵が直接渡されている'
  )
})
