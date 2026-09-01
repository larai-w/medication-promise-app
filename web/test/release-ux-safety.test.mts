import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('settings keeps account-data deletion available alongside optional metrics', async () => {
  const [settings, deletionHandler, login] = await Promise.all([
    read('src/components/SettingsScreen.tsx'),
    read('src/lib/account-deletion-handler.ts'),
    read('src/app/login/page.tsx'),
  ])

  assert.match(settings, /\/api\/account\/data/)
  assert.match(settings, /世帯データを削除/)
  assert.match(settings, /アプリの画面から元に戻すことはできません/)
  assert.match(settings, /metricsConsent/)
  assert.match(deletionHandler, /最大35日間/)
  assert.match(deletionHandler, /この操作の取り消しには利用できません/)
  assert.match(deletionHandler, /Alexaアプリのリマインダーとログイン用認証アカウントは削除されません/)
  assert.match(login, /Alexaアプリで削除してください/)
  assert.match(login, /ログイン用認証アカウントの削除/)
})

test('release copy keeps the medical boundary without removing the playful UI', async () => {
  const [terms, weeklyReport, badges] = await Promise.all([
    read('src/app/terms/page.tsx'),
    read('src/components/WeeklyReport.tsx'),
    read('src/lib/badges.ts'),
  ])

  assert.match(terms, /医療機器ではありません/)
  assert.match(terms, /服薬した事実を保証せず/)
  assert.match(terms, /医師や薬剤師の指示/)
  assert.match(weeklyReport, /AIが記録データから自動生成した下書き/)
  assert.match(weeklyReport, /ご本人・ご家族が内容を確認/)
  assert.match(weeklyReport, /服薬の判断には使わないでください/)
  assert.match(badges, /月間パーフェクト/)
  assert.match(badges, /朝の達人/)
})

test('privacy copy states optional metric scope and retention', async () => {
  const [privacy, terms] = await Promise.all([
    read('src/app/privacy/page.tsx'),
    read('src/app/terms/page.tsx'),
  ])

  assert.match(privacy, /本人が任意で許可/)
  assert.match(privacy, /薬名、記録内容、メモ、端末を追跡するIDを含めません/)
  assert.match(privacy, /35日以内に自動削除/)
  assert.match(privacy, /最大35日間データが残る場合があります/)
  assert.match(privacy, /Alexaアプリで削除してください/)
  assert.match(terms, /アプリの画面から元に戻すことはできません/)
  assert.match(terms, /ログイン用認証アカウントは削除対象外/)
})

// 2026-09-01: その日のメモを画面に出した。
// /api/condition の PUT は item ごと置き換えるので、体調だけを送ると
// **既に書いてあるメモが黙って消える。** UI が無かったあいだは表に出て
// いなかったが、メモを書けるようにした時点で実害になる。
test('saving the daily condition never wipes an existing note', async () => {
  const main = await read('src/components/MainScreen.tsx')

  const conditionPuts = [...main.matchAll(/fetch\('\/api\/condition',[\s\S]*?\)\s*\n/g)].map(m => m[0])
  assert.ok(conditionPuts.length >= 2, '体調とメモ、2つの保存経路が見つからない')
  for (const call of conditionPuts) {
    assert.match(call, /note:/, `note を送らない PUT がある: ${call.slice(0, 120)}`)
  }
})

test('the daily note is offered outside the medication entries', async () => {
  const main = await read('src/components/MainScreen.tsx')

  // 服薬記録に紐づくメモ（AddEditModal）とは別に、その日についてのメモを持つ。
  assert.match(main, /その日のメモ（任意）/)
  assert.match(main, /id="condition-note"/)
  assert.match(main, /maxLength=\{200\}/)
  // 体調が未記録のときに勝手なスコアを作らない。
  assert.match(main, /先に上の1〜5を選ぶと書けます/)
  assert.doesNotMatch(main, /score:\s*3\b/, '体調を既定値で埋めていないか')
})
