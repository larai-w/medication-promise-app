// 同意判定の回帰テスト。AWS は呼ばない。
//
// ここで守りたいのは「同意していないのに granted と読まれない」こと。
// 逆（granted なのに false）は機能が使えないだけで、健康データが
// 意図せず扱われることは無い。fail closed 側に倒す。

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildGrantRecord,
  buildRevokeRecord,
  effectiveStatus,
  evaluateAll,
  evaluateConsent,
  latestRecord,
  type ConsentRecord,
  type ConsentType,
} from './consent-record.ts'

const NOW = new Date('2026-08-24T10:00:00.000Z')

function record(over: Partial<ConsentRecord> & { consentType: ConsentType }): ConsentRecord {
  return {
    consentId: over.consentId ?? `c-${over.consentType}`,
    userId: 'user-1',
    productId: 'medpromise',
    status: 'granted',
    grantedAt: '2026-08-01T00:00:00.000Z',
    ppVersion: '1.0',
    consentTextVersion: '1.0',
    source: 'app_ui',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

test('レコードが無ければ granted にならない', () => {
  const r = evaluateConsent([], 'basic', NOW)
  assert.equal(r.granted, false)
  assert.equal(r.ownStatus, 'absent')
})

test('撤回済みは granted にならない', () => {
  const r = evaluateConsent([record({ consentType: 'basic', status: 'revoked' })], 'basic', NOW)
  assert.equal(r.granted, false)
  assert.equal(r.ownStatus, 'revoked')
})

test('expiresAt を過ぎていれば、status が granted のままでも expired', () => {
  const expired = record({ consentType: 'basic', expiresAt: '2026-08-24T09:59:59.000Z' })
  assert.equal(effectiveStatus(expired, NOW), 'expired')
  assert.equal(evaluateConsent([expired], 'basic', NOW).granted, false)
})

test('expiresAt ちょうどは切れている扱い', () => {
  const boundary = record({ consentType: 'basic', expiresAt: NOW.toISOString() })
  assert.equal(effectiveStatus(boundary, NOW), 'expired')
})

test('expiresAt がまだ先なら有効', () => {
  const alive = record({ consentType: 'basic', expiresAt: '2027-01-01T00:00:00.000Z' })
  assert.equal(evaluateConsent([alive], 'basic', NOW).granted, true)
})

test('前提条件が欠けていれば granted にならない（basic 無しの event_export）', () => {
  const r = evaluateConsent([record({ consentType: 'event_export' })], 'event_export', NOW)
  assert.equal(r.granted, false)
  assert.equal(r.ownStatus, 'granted', 'それ自体は granted のはず')
  assert.equal(r.blockedBy, 'basic')
})

test('basic を撤回すると event_export も落ちる', () => {
  const records = [
    record({ consentType: 'basic', status: 'revoked' }),
    record({ consentType: 'event_export' }),
  ]
  assert.equal(evaluateConsent(records, 'event_export', NOW).blockedBy, 'basic')
})

test('basic の期限切れでも event_export は落ちる', () => {
  const records = [
    record({ consentType: 'basic', expiresAt: '2026-08-02T00:00:00.000Z' }),
    record({ consentType: 'event_export' }),
  ]
  assert.equal(evaluateConsent(records, 'event_export', NOW).granted, false)
})

test('third_party は basic と event_export の両方が要る', () => {
  const withoutExport = [record({ consentType: 'basic' }), record({ consentType: 'third_party' })]
  assert.equal(evaluateConsent(withoutExport, 'third_party', NOW).blockedBy, 'event_export')

  const full = [
    record({ consentType: 'basic' }),
    record({ consentType: 'event_export' }),
    record({ consentType: 'third_party' }),
  ]
  assert.equal(evaluateConsent(full, 'third_party', NOW).granted, true)
})

test('同じ種別が複数あるとき、最後のものが勝つ', () => {
  const records = [
    record({ consentType: 'basic', consentId: 'old', updatedAt: '2026-08-01T00:00:00.000Z' }),
    record({
      consentType: 'basic',
      consentId: 'new',
      status: 'revoked',
      updatedAt: '2026-08-20T00:00:00.000Z',
    }),
  ]
  assert.equal(latestRecord(records)?.consentId, 'new')
  assert.equal(evaluateConsent(records, 'basic', NOW).granted, false)
})

test('撤回してから同意し直した順序を正しく読む', () => {
  const records = [
    record({ consentType: 'basic', consentId: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }),
    record({
      consentType: 'basic',
      consentId: 'b',
      status: 'revoked',
      updatedAt: '2026-08-10T00:00:00.000Z',
    }),
    record({ consentType: 'basic', consentId: 'c', updatedAt: '2026-08-20T00:00:00.000Z' }),
  ]
  assert.equal(evaluateConsent(records, 'basic', NOW).granted, true)
})

test('配列の順番を変えても結果が変わらない', () => {
  const records = [
    record({ consentType: 'basic', consentId: 'a', updatedAt: '2026-08-01T00:00:00.000Z' }),
    record({
      consentType: 'basic',
      consentId: 'b',
      status: 'revoked',
      updatedAt: '2026-08-10T00:00:00.000Z',
    }),
  ]
  const forward = evaluateConsent(records, 'basic', NOW).granted
  const reversed = evaluateConsent([...records].reverse(), 'basic', NOW).granted
  assert.equal(forward, reversed)
  assert.equal(forward, false)
})

test('evaluateAll は4種別すべてを返し、既定はすべて granted でない', () => {
  const all = evaluateAll([], NOW)
  assert.deepEqual(Object.keys(all).sort(), [
    'ai_analysis',
    'basic',
    'event_export',
    'third_party',
  ])
  for (const [type, value] of Object.entries(all)) {
    assert.equal(value.granted, false, `${type} が既定で granted になっている`)
  }
})

test('buildGrantRecord は監査情報を渡されたときだけ入れる', () => {
  const bare = buildGrantRecord(
    {
      consentId: 'c1',
      userId: 'u1',
      consentType: 'basic',
      ppVersion: '1.0',
      consentTextVersion: '1.0',
    },
    NOW,
  )
  assert.equal(bare.ipAddress, undefined)
  assert.equal(bare.userAgent, undefined)
  assert.equal(bare.expiresAt, undefined)
  assert.equal(bare.productId, 'medpromise')
  assert.equal(bare.status, 'granted')
  assert.equal(bare.grantedAt, NOW.toISOString())
  assert.equal(bare.source, 'app_ui')

  const audited = buildGrantRecord(
    {
      consentId: 'c2',
      userId: 'u1',
      consentType: 'basic',
      ppVersion: '1.0',
      consentTextVersion: '1.0',
      ipAddress: '203.0.113.1',
      userAgent: 'test-agent',
    },
    NOW,
  )
  assert.equal(audited.ipAddress, '203.0.113.1')
  assert.equal(audited.userAgent, 'test-agent')
})

test('撤回は元のレコードを書き換えず、新しいレコードを積む', () => {
  const granted = buildGrantRecord(
    {
      consentId: 'c1',
      userId: 'u1',
      consentType: 'event_export',
      ppVersion: '1.0',
      consentTextVersion: '1.0',
    },
    new Date('2026-08-01T00:00:00.000Z'),
  )
  const revoked = buildRevokeRecord(granted, 'c2', NOW)

  assert.equal(granted.status, 'granted', '元のレコードが書き換わっている')
  assert.equal(granted.revokedAt, undefined)
  assert.equal(revoked.status, 'revoked')
  assert.equal(revoked.revokedAt, NOW.toISOString())
  assert.equal(revoked.consentId, 'c2')
  // いつ同意したかは撤回レコードにも残す（監査要件）
  assert.equal(revoked.grantedAt, granted.grantedAt)
  assert.equal(revoked.ppVersion, granted.ppVersion)

  assert.equal(evaluateConsent([granted, revoked], 'event_export', NOW).ownStatus, 'revoked')
})
