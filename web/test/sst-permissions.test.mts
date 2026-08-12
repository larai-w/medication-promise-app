import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('household transactions include the condition-check IAM action', async () => {
  const config = await readFile(new URL('../sst.config.ts', import.meta.url), 'utf8')

  assert.match(config, /'dynamodb:ConditionCheckItem'/)
  assert.match(config, /'dynamodb:TransactWriteItems'/)
})
