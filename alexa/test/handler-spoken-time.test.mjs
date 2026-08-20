import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from '../index.mjs'

function intentEvent(name, agoValue) {
  const intent = { name }
  if (agoValue !== undefined) intent.slots = { ago: { value: agoValue } }
  return {
    request: { type: 'IntentRequest', intent },
    context: { System: { apiEndpoint: 'https://api.amazonalexa.test', apiAccessToken: 't' } },
  }
}

function harness() {
  const calls = []
  const handler = createHandler({
    recordMedicationFn: async (timing, opts) => {
      calls.push({ timing, ...opts })
      // 実際の recordMedication は記録した時刻を返す
      return { date: '2026-08-20', time: opts?.minutesAgo ? '08:30' : '14:00', timing }
    },
  })
  return { handler, calls }
}

// 応答は PlainText。ssml ではない
const speech = (r) => r.response.outputSpeech.text

test('言わなければ従来どおり — 既存の使い方は変わらない', async () => {
  const { handler, calls } = harness()
  const res = await handler(intentEvent('RecordMorningIntent'))
  assert.deepEqual(calls, [{ timing: '朝', minutesAgo: null }])
  assert.match(speech(res), /朝の服薬を記録しました/)
  // 時刻を言っていないのに時刻を読み上げない
  assert.doesNotMatch(speech(res), /飲んだ/)
})

test('「30分前」と言えば、その分だけ遡って記録する', async () => {
  const { handler, calls } = harness()
  const res = await handler(intentEvent('RecordMorningIntent', 'PT30M'))
  assert.deepEqual(calls, [{ timing: '朝', minutesAgo: 30 }])
  // 解釈した時刻を必ず読み上げる。聞き間違いに気づける唯一の手段
  assert.match(speech(res), /8時30分に飲んだ/)
  assert.match(speech(res), /朝の服薬を記録しました/)
})

test('聞き取れない値は記録せず、言い直してもらう', async () => {
  const { handler, calls } = harness()
  const res = await handler(intentEvent('RecordMorningIntent', 'PT20H'))
  assert.equal(calls.length, 0, '妥当でない値をDBへ書いてはいけない')
  assert.match(speech(res), /聞き取れませんでした/)
  assert.match(speech(res), /12時間以内/)
})

test('夜9時のねぎらい文言は、時刻を言わないときだけ出す', async () => {
  const a = harness()
  const plain = await a.handler(intentEvent('RecordNightNineIntent'))
  assert.match(speech(plain), /ゆっくりお休みください/)

  const b = harness()
  const withTime = await b.handler(intentEvent('RecordNightNineIntent', 'PT1H'))
  // 時刻を指定したときは、解釈結果の読み上げを優先する
  assert.match(speech(withTime), /8時30分に飲んだ/)
  assert.deepEqual(b.calls, [{ timing: '夜9時', minutesAgo: 60 }])
})

test('5つの服薬インテントすべてで時刻指定が効く', async () => {
  const expected = {
    RecordMorningIntent: '朝', RecordLunchIntent: '昼', RecordDinnerIntent: '晩',
    RecordNightEightIntent: '夜8時', RecordNightNineIntent: '夜9時',
  }
  for (const [intent, timing] of Object.entries(expected)) {
    const { handler, calls } = harness()
    await handler(intentEvent(intent, 'PT45M'))
    assert.deepEqual(calls, [{ timing, minutesAgo: 45 }], intent)
  }
})
