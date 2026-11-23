import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('SST builds with the audited OpenNext adapter instead of its bundled default', async () => {
  const config = await readFile(new URL('../sst.config.ts', import.meta.url), 'utf8')
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const web = config.match(/new sst\.aws\.Nextjs\('Web', \{([\s\S]*?)environment:/)?.[1]
  assert.ok(web, 'Web Nextjs component must be present')
  const version = web.match(/openNextVersion:\s*['\"]([^'\"]+)['\"]/)?.[1]
  assert.equal(version, lock.packages['node_modules/@opennextjs/aws'].version, 'SST adapter version must match the audited lockfile')
})
