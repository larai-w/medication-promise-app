import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('deployment zip command includes every local module imported by index', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const zipCommand = packageJson.scripts.zip
  for (const file of ['index.mjs', 'spoken-time.mjs', 'config.mjs', 'dynamodb.mjs', 'household.mjs', 'cognito.mjs']) {
    assert.match(zipCommand, new RegExp(`\\b${file.replace('.', '\\.') }\\b`), `missing ${file}`)
  }
})
