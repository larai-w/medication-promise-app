import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('settings keeps account-data deletion available alongside optional metrics', async () => {
  const settings = await read('src/components/SettingsScreen.tsx')

  assert.match(settings, /\/api\/account\/data/)
  assert.match(settings, /世帯データを削除/)
  assert.match(settings, /metricsConsent/)
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
  const privacy = await read('src/app/privacy/page.tsx')

  assert.match(privacy, /本人が任意で許可/)
  assert.match(privacy, /薬名、記録内容、メモ、端末を追跡するIDを含めません/)
  assert.match(privacy, /35日以内に自動削除/)
})
