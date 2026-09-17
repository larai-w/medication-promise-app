/**
 * 表示・読み上げの名前を変えても、**保存する値は変わらない**ことを縛る。
 *
 * 2026-09-16、オーナーの依頼で「晩」を「夕方」と呼ぶようにした。
 * このとき保存値まで変えると、過去の記録と比べられなくなり、
 * 書き出しスキーマ（v1/v2）の `enum` と care-event の契約も壊れる。
 *
 * Web（`web/src/lib/constants.ts`）と Alexa（`alexa/config.mjs`）は
 * zip で固める都合上 import を共有できず、同じ対応表を複製している。
 * **ずれると画面と音声で呼び名が食い違う**ので、ここで読み比べる。
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { DEFAULT_REMINDER_SCHEDULE, TIMINGS, TIMING_LABELS, timingLabel } from '../src/lib/constants.ts'
import {
  DEFAULT_REMINDER_SCHEDULE as ALEXA_SCHEDULE,
  TIMING_LABELS as ALEXA_TIMING_LABELS,
  buildReminderText,
  formatReminderSummary,
  timingLabel as alexaTimingLabel,
} from '../../alexa/config.mjs'

const STORED_TIMINGS = ['朝', '昼', '晩', '夜8時', '夜9時']

test('保存値は変わらない（Web）', () => {
  assert.deepEqual(DEFAULT_REMINDER_SCHEDULE.map(({ timing }) => timing), STORED_TIMINGS)
  assert.deepEqual(TIMINGS, STORED_TIMINGS)
  assert.deepEqual(Object.keys(TIMING_LABELS), STORED_TIMINGS)
})

test('保存値は変わらない（Alexa）', () => {
  assert.deepEqual(ALEXA_SCHEDULE.map(({ timing }) => timing), STORED_TIMINGS)
  // 18時の枠の保存値は '晩' のまま。'夕方' で保存してはいけない。
  const evening = ALEXA_SCHEDULE.find(({ timing }) => timing === '晩')
  assert.equal(evening?.hour, 18)
})

test('「晩」は「夕方」と表示・読み上げする', () => {
  assert.equal(timingLabel('晩'), '夕方')
  assert.equal(alexaTimingLabel('晩'), '夕方')
  for (const timing of ['朝', '昼', '夜8時', '夜9時']) {
    assert.equal(timingLabel(timing), timing)
    assert.equal(alexaTimingLabel(timing), timing)
  }
})

test('知らない値はそのまま返す（消さない・置き換えない）', () => {
  assert.equal(timingLabel('就寝前'), '就寝前')
  assert.equal(alexaTimingLabel('就寝前'), '就寝前')
})

test('Web と Alexa の対応表がずれていない', () => {
  assert.deepEqual({ ...ALEXA_TIMING_LABELS }, { ...TIMING_LABELS })
})

test('リマインダーの読み上げに「晩」が出ない', () => {
  const text = buildReminderText('晩', 'お薬')
  assert.ok(text.startsWith('夕方の'), text)
  assert.ok(!text.includes('晩'), text)

  const summary = formatReminderSummary(ALEXA_SCHEDULE.map((item) => ({ ...item })))
  assert.ok(summary.includes('夕方18時'), summary)
  assert.ok(!summary.includes('晩'), summary)
})
