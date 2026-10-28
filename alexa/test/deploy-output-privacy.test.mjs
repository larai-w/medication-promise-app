import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../../', import.meta.url))
const workflow = readFileSync(join(root, '.github/workflows/deploy-alexa.yml'), 'utf8')
const safeQuery = '{CodeSha256:CodeSha256,LastUpdateStatus:LastUpdateStatus}'
const privateMarker = 'SYNTHETIC_ENVIRONMENT_VALUE_DO_NOT_LOG'

function updateStepScript() {
  const lines = workflow.split('\n')
  const step = lines.indexOf('      - name: Update Lambda function code')
  assert.ok(step >= 0, 'Lambda update step is present')
  const run = lines.findIndex((line, index) => index > step && line === '        run: |')
  assert.ok(run > step, 'Update step has an executable Bash block')
  const body = []
  for (const line of lines.slice(run + 1)) {
    if (!line.trim()) body.push('')
    else if (line.startsWith('          ')) body.push(line.slice(10))
    else break
  }
  assert.ok(body.join('\n').includes('aws lambda update-function-code'))
  return body.join('\n')
}

function runStep(scenario = 'success') {
  const folder = mkdtempSync(join(tmpdir(), 'alexa-deploy-output-'))
  try {
    const callsFile = join(folder, 'calls.jsonl')
    const aws = join(folder, 'aws')
    writeFileSync(aws, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.FAKE_AWS_CALLS, JSON.stringify(args) + '\\n')
const value = (key) => args[args.indexOf(key) + 1]
if (args[0] !== 'lambda' || value('--function-name') !== 'synthetic-function') process.exit(99)
if (args[1] === 'update-function-code') {
  if (process.env.FAKE_AWS_SCENARIO === 'update-failure') {
    console.error('Synthetic update rejected')
    process.exit(42)
  }
  const result = { CodeSha256: 'synthetic-code-hash', LastUpdateStatus: 'InProgress' }
  if (value('--query') !== ${JSON.stringify(safeQuery)} || value('--output') !== 'json') {
    result.Environment = { Variables: { EXAMPLE_SETTING: ${JSON.stringify(privateMarker)} } }
  }
  console.log(JSON.stringify(result))
} else if (args[1] === 'get-function-configuration') {
  if (value('--query') === 'LastUpdateStatus' && value('--output') === 'text') console.log('Successful')
  else if (value('--query') === '{State:State,LastUpdateStatus:LastUpdateStatus}' && value('--output') === 'json') {
    console.log(JSON.stringify({ State: 'Active', LastUpdateStatus: 'Successful' }))
  } else {
    console.log(JSON.stringify({ Environment: { Variables: { EXAMPLE_SETTING: ${JSON.stringify(privateMarker)} } } }))
  }
} else process.exit(99)
`)
    chmodSync(aws, 0o700)
    const script = join(folder, 'update.sh')
    writeFileSync(script, updateStepScript())
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', script], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: `${folder}:${dirname(process.execPath)}:${process.env.PATH}`,
        LAMBDA_NAME: 'synthetic-function', FAKE_AWS_CALLS: callsFile, FAKE_AWS_SCENARIO: scenario },
    })
    assert.ifError(result.error)
    const calls = readFileSync(callsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    return { ...result, calls }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

test('actual deployment step emits only reviewed update metadata, never environment values', () => {
  const result = runStep()
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!`${result.stdout}${result.stderr}`.includes(privateMarker))
  const output = result.stdout.trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(output, [
    { CodeSha256: 'synthetic-code-hash', LastUpdateStatus: 'InProgress' },
    { State: 'Active', LastUpdateStatus: 'Successful' },
  ])
  assert.deepEqual(result.calls.map((args) => args.slice(0, 2)), [
    ['lambda', 'update-function-code'], ['lambda', 'get-function-configuration'], ['lambda', 'get-function-configuration'],
  ])
})

test('actual deployment step propagates update failure and does not poll or print configuration', () => {
  const result = runStep('update-failure')
  assert.equal(result.status, 42)
  assert.equal(result.calls.length, 1)
  assert.equal(result.calls[0][1], 'update-function-code')
  assert.ok(!`${result.stdout}${result.stderr}`.includes(privateMarker))
})
