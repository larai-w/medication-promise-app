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
