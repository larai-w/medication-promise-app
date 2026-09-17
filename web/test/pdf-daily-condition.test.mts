import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { makePdfHandler } from '../src/lib/api-handlers.ts'

const household = { partitionKey: 'USER#x' } as never

test('PDF ハンドラはその日の調子とメモも読み込んで renderPdf に渡す', async () => {
  // 2026-09-17 の報告: 画面に書いた「その日のメモ」が PDF に出てこない。
  // 原因は、ハンドラが服薬記録しか取得していなかったこと。データは残っていた。
  let passed: unknown[] = []
  let conditionQuery: unknown = null

  const GET = makePdfHandler({
    resolveHousehold: async () => ({ household }) as never,
    listRecords: async () => [] as never,
    listConditions: async (_h, q) => { conditionQuery = q; return [
      { date: '2026-09-16', score: 3, observedAt: '', recordedAt: '', note: 'よく眠れた' },
    ] as never },
    renderPdf: async (...args) => { passed = args; return new Uint8Array([1]) },
  })

  const res = await GET(new Request('https://example.test/api/records/pdf?month=2026-09'))
  assert.equal(res.status, 200)

  // 月の全期間で調子を引いている
  assert.deepEqual(conditionQuery, { from: '2026-09-01', to: '2026-09-30' })

  // renderPdf の4番目の引数として渡っている
  const conditions = passed[3] as { date: string; note?: string }[]
  assert.equal(conditions.length, 1)
  assert.equal(conditions[0].note, 'よく眠れた')
})

test('MedPdfDocument が調子の列とその日のメモを描画している', async () => {
  const doc = await readFile(new URL('../src/lib/MedPdfDocument.tsx', import.meta.url), 'utf8')
  // 調子の列
  assert.match(doc, /調子/)
  assert.match(doc, /\$\{condition\.score\}\/5/)
  // その日のメモを、服薬ごとのメモより先に出す
  assert.match(doc, /condition\?\.note \? \[condition\.note\] : \[\]/)
  // 服薬ごとのメモも消していない
  assert.match(doc, /data\[t\]\?\.notes/)
})

test('服薬ごとのメモは表示名で出す（保存値そのままではない）', async () => {
  // 2026-09-16 に「晩」を「夕方」と呼ぶことにした。PDF もそれに従う。
  const doc = await readFile(new URL('../src/lib/MedPdfDocument.tsx', import.meta.url), 'utf8')
  assert.match(doc, /\$\{timingLabel\(t\)\}: \$\{data\[t\]\.notes\}/)
})
