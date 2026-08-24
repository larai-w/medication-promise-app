// 保存層のテスト。DynamoDB は呼ばないが、**渡している引数そのものを検算する。**
//
// CLAUDE.md §2.56: モックは何でも受け取るので、モックした先の引数を
// アサートしないとテストは緑のまま本番が落ちる。実際 indoor_temp_logger で
// 起きた。ここではキー・テーブル名・Item の中身を1つずつ見る。

import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import { docClient, TABLE_NAME } from '../dynamodb.ts'
import {
  CONSENT_SK_PREFIX,
  getConsentState,
  grantConsent,
  hasConsent,
  listConsentRecords,
  makeConsentSK,
  revokeConsent,
} from './consent-store.ts'
import type { ConsentRecord } from './consent-record.ts'

const NOW = new Date('2026-08-24T10:00:00.000Z')
const realSend = docClient.send.bind(docClient)

type Sent = { name: string; input: Record<string, unknown> }

/** send をすげ替え、送られたコマンドを記録する。 */
function stubSend(handler: (sent: Sent) => unknown) {
  const sent: Sent[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(docClient as any).send = async (command: any) => {
    const entry = { name: command.constructor.name, input: command.input }
    sent.push(entry)
    return handler(entry)
  }
  return sent
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(docClient as any).send = realSend
})

function storedRecord(over: Partial<ConsentRecord> & { consentType: ConsentRecord['consentType'] }) {
  return {
    consentId: over.consentId ?? 'c1',
    userId: 'u1',
    productId: 'medpromise' as const,
    status: 'granted' as const,
    grantedAt: '2026-08-01T00:00:00.000Z',
    ppVersion: '1.0',
    consentTextVersion: '1.0',
    source: 'app_ui' as const,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

test('SK は CONSENT# で始まり、記録用の RECORD# と混ざらない', () => {
  const sk = makeConsentSK('event_export', 'abc')
  assert.ok(sk.startsWith(CONSENT_SK_PREFIX))
  assert.equal(sk, 'CONSENT#event_export#abc')
  assert.ok(!sk.startsWith('RECORD#'))
})

test('listConsentRecords は CONSENT# だけを引く（記録を巻き込まない）', async () => {
  const sent = stubSend(() => ({ Items: [] }))
  await listConsentRecords('u1')

  assert.equal(sent.length, 1)
  assert.equal(sent[0].name, 'QueryCommand')
  assert.equal(sent[0].input.TableName, TABLE_NAME)
  assert.equal(sent[0].input.KeyConditionExpression, 'PK = :pk AND begins_with(SK, :sk)')
  assert.deepEqual(sent[0].input.ExpressionAttributeValues, {
    ':pk': 'USER#u1',
    ':sk': 'CONSENT#',
  })
})

test('grantConsent が実際に書く Item を検算する', async () => {
  const sent = stubSend(() => ({}))
  const record = await grantConsent(
    {
      consentId: 'c-new',
      userId: 'u1',
      consentType: 'basic',
      ppVersion: '2.0',
      consentTextVersion: '1.1',
    },
    NOW,
  )

  assert.equal(sent.length, 1)
  assert.equal(sent[0].name, 'PutCommand')
  const item = sent[0].input.Item as Record<string, unknown>

  assert.equal(sent[0].input.TableName, TABLE_NAME)
  assert.equal(item.PK, 'USER#u1')
  assert.equal(item.SK, 'CONSENT#basic#c-new')
  assert.equal(item.productId, 'medpromise')
  assert.equal(item.status, 'granted')
  assert.equal(item.grantedAt, NOW.toISOString())
  assert.equal(item.ppVersion, '2.0')
  assert.equal(item.consentTextVersion, '1.1')
  // 渡していない監査情報を勝手に入れない
  assert.ok(!('ipAddress' in item), 'ipAddress が勝手に入っている')
  assert.ok(!('userAgent' in item), 'userAgent が勝手に入っている')
  assert.equal(record.status, 'granted')
})

test('revokeConsent は元のレコードを上書きせず、別の SK へ積む', async () => {
  const existing = storedRecord({ consentType: 'event_export', consentId: 'c-old' })
  const sent = stubSend((s) => (s.name === 'QueryCommand' ? { Items: [existing] } : {}))

  const revoked = await revokeConsent('u1', 'event_export', 'c-rev', NOW)

  const puts = sent.filter((s) => s.name === 'PutCommand')
  assert.equal(puts.length, 1)
  const item = puts[0].input.Item as Record<string, unknown>

  assert.equal(item.SK, 'CONSENT#event_export#c-rev')
  assert.notEqual(item.SK, makeConsentSK('event_export', 'c-old'), '元のレコードを上書きしている')
  assert.equal(item.status, 'revoked')
  assert.equal(item.revokedAt, NOW.toISOString())
  // いつ同意したかは撤回レコードにも残す
  assert.equal(item.grantedAt, existing.grantedAt)
  assert.equal(revoked?.status, 'revoked')
})

test('撤回するものが無ければ何も書かず null を返す', async () => {
  const sent = stubSend((s) => (s.name === 'QueryCommand' ? { Items: [] } : {}))
  const result = await revokeConsent('u1', 'basic', 'c-rev', NOW)

  assert.equal(result, null)
  assert.equal(sent.filter((s) => s.name === 'PutCommand').length, 0, '空振りで書き込んでいる')
})

test('すでに撤回済みなら二重に積まない', async () => {
  const existing = storedRecord({ consentType: 'basic', status: 'revoked' })
  const sent = stubSend((s) => (s.name === 'QueryCommand' ? { Items: [existing] } : {}))

  assert.equal(await revokeConsent('u1', 'basic', 'c-rev', NOW), null)
  assert.equal(sent.filter((s) => s.name === 'PutCommand').length, 0)
})

test('読み取りに失敗したら granted を返さない（fail closed）', async () => {
  stubSend(() => {
    throw new Error('DynamoDB unavailable')
  })
  const result = await hasConsent('u1', 'basic', NOW)
  assert.equal(result.granted, false)
})

// ここを混ぜると、DB が落ちただけで服薬の記録ができなくなる。
// 逆に unavailable を absent と読むと、同意画面を出して「同意する」を
// 押させ、書き込みも失敗する、という最悪の体験になる。
test('「同意が無い」と「読めなかった」を区別する', async () => {
  stubSend(() => {
    throw new Error('DynamoDB unavailable')
  })
  assert.equal((await hasConsent('u1', 'basic', NOW)).ownStatus, 'unavailable')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(docClient as any).send = async () => ({ Items: [] })
  assert.equal((await hasConsent('u1', 'basic', NOW)).ownStatus, 'absent')
})

test('保存された status が granted でも、期限切れなら granted を返さない', async () => {
  const expired = storedRecord({
    consentType: 'basic',
    expiresAt: '2026-08-02T00:00:00.000Z',
  })
  stubSend(() => ({ Items: [expired] }))
  assert.equal((await hasConsent('u1', 'basic', NOW)).granted, false)
})

test('getConsentState は4種別すべてを返す', async () => {
  stubSend(() => ({ Items: [storedRecord({ consentType: 'basic' })] }))
  const state = await getConsentState('u1', NOW)

  assert.equal(state.basic.granted, true)
  assert.equal(state.event_export.granted, false)
  assert.equal(state.ai_analysis.granted, false)
  assert.equal(state.third_party.granted, false)
})
