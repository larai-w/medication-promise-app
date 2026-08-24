// 「同意画面を出すかどうか」の判断を固定する。
//
// ここが一番こわい。同意画面は**手段を置き換える**変更で、失敗すると
// 服薬の記録ができなくなる。対象は代わりの手段を持たないことが多い
// （CLAUDE.md §2.6）。
//
// 守りたい不変条件はこの2つ:
//   1. こちらの障害で、記録を止めない
//   2. 研究へのデータ利用は、確認できなければ通さない

import assert from 'node:assert/strict'
import test from 'node:test'

import { decideAppGate, mayUseForResearch } from './consent-gate.ts'
import type { ConsentEvaluation, ConsentType } from './consent-record.ts'

function state(over: Partial<Record<ConsentType, ConsentEvaluation>> = {}) {
  const absent: ConsentEvaluation = { granted: false, ownStatus: 'absent' }
  return {
    basic: absent,
    event_export: absent,
    ai_analysis: absent,
    third_party: absent,
    ...over,
  }
}

test('同意していなければ同意画面を出す', () => {
  assert.deepEqual(decideAppGate(state()), { kind: 'ask' })
})

test('撤回・期限切れも、改めて同意を取る', () => {
  for (const s of ['revoked', 'expired'] as const) {
    const decision = decideAppGate(state({ basic: { granted: false, ownStatus: s } }))
    assert.equal(decision.kind, 'ask', `${s} で ask にならない`)
  }
})

test('同意済みならそのまま使える', () => {
  assert.deepEqual(decideAppGate(state({ basic: { granted: true, ownStatus: 'granted' } })), {
    kind: 'allow',
  })
})

// ── ここが本題 ───────────────────────────────────────────────────────────
test('状態を取れなくても、記録は止めない', () => {
  const decision = decideAppGate(null)
  assert.equal(decision.kind, 'allow-unverified')
  assert.notEqual(decision.kind, 'ask', '同意画面を出すと、押した先の書き込みも失敗して閉じ込める')
})

test('読み取り失敗（unavailable）でも、記録は止めない', () => {
  const decision = decideAppGate(state({ basic: { granted: false, ownStatus: 'unavailable' } }))
  assert.equal(decision.kind, 'allow-unverified')
})

test('確認できなかったときは、黙って通さず注意を出す', () => {
  for (const input of [null, state({ basic: { granted: false, ownStatus: 'unavailable' } })]) {
    const decision = decideAppGate(input)
    assert.equal(decision.kind, 'allow-unverified')
    if (decision.kind === 'allow-unverified') {
      assert.ok(decision.notice.length > 0, '注意文が空')
      assert.match(decision.notice, /記録/, '記録が続けられることが伝わらない')
    }
  }
})

// ── 研究利用は基準が違う ─────────────────────────────────────────────────
test('研究利用は、確認できなければ通さない', () => {
  assert.equal(mayUseForResearch(null), false)
  assert.equal(
    mayUseForResearch(state({ event_export: { granted: false, ownStatus: 'unavailable' } })),
    false,
  )
})

test('研究利用は event_export が granted のときだけ通す', () => {
  assert.equal(mayUseForResearch(state()), false)
  assert.equal(
    mayUseForResearch(state({ event_export: { granted: true, ownStatus: 'granted' } })),
    true,
  )
})

test('basic が落ちて event_export が blocked なら研究利用も通さない', () => {
  assert.equal(
    mayUseForResearch(
      state({
        basic: { granted: false, ownStatus: 'revoked' },
        event_export: { granted: false, ownStatus: 'granted', blockedBy: 'basic' },
      }),
    ),
    false,
  )
})

test('アプリ利用と研究利用で基準が違うことを、同じ入力で確認する', () => {
  const unavailable = state({
    basic: { granted: false, ownStatus: 'unavailable' },
    event_export: { granted: false, ownStatus: 'unavailable' },
  })
  // 記録は続けられる
  assert.equal(decideAppGate(unavailable).kind, 'allow-unverified')
  // でも研究には使わない
  assert.equal(mayUseForResearch(unavailable), false)
})
