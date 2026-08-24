// バージョンのドリフト検知。
//
// 「プライバシーポリシーを直したのに ppVersion を上げ忘れる」と、古い説明に
// 同意した人と新しい説明に同意した人が同じ版で記録される。後から
// 「誰が何に同意したか」を復元できなくなり、同意記録が意味を失う。
//
// 画面のハードコードに戻された場合もここで落ちる。

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  CONSENT_TEXT_VERSION,
  PRIVACY_POLICY_UPDATED_LABEL,
  PRIVACY_POLICY_VERSION,
  labelToIsoDate,
} from './consent-versions.ts'

test('画面の表記と版が同じ日を指している', () => {
  assert.equal(labelToIsoDate(PRIVACY_POLICY_UPDATED_LABEL), PRIVACY_POLICY_VERSION)
})

test('labelToIsoDate は1桁の月日をゼロ埋めし、読めない表記は null', () => {
  assert.equal(labelToIsoDate('2026年1月5日'), '2026-01-05')
  assert.equal(labelToIsoDate('2026-08-19'), null)
  assert.equal(labelToIsoDate(''), null)
})

test('ポリシーの版は YYYY-MM-DD（画面の表記と突き合わせるため）', () => {
  assert.match(PRIVACY_POLICY_VERSION, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(!Number.isNaN(new Date(PRIVACY_POLICY_VERSION).getTime()))
})

test('文言の版は YYYY-MM-DD か YYYY-MM-DD-N（同日に2回直すことがある）', () => {
  const m = CONSENT_TEXT_VERSION.match(/^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/)
  assert.ok(m, `版の形が違う: ${CONSENT_TEXT_VERSION}`)
  assert.ok(!Number.isNaN(new Date(m[1]).getTime()), `日付として読めない: ${m[1]}`)
  if (m[2]) assert.ok(Number(m[2]) >= 2, '同日の連番は 2 から始める')
})

test('プライバシーポリシーの画面は定数を使っていて、日付を直書きしていない', () => {
  const source = readFileSync(new URL('../../app/privacy/page.tsx', import.meta.url), 'utf8')
  assert.ok(
    source.includes('PRIVACY_POLICY_UPDATED_LABEL'),
    '画面が定数を使っていない。版がずれても誰も気づけない',
  )
  assert.ok(
    !/updated="[^"]*年[^"]*"/.test(source),
    '更新日が直書きに戻っている',
  )
})
