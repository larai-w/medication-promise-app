#!/usr/bin/env node
/**
 * production 以外の stage 用に、記録テーブルを作成する。
 *
 * F-07: 従来 sst.config.ts は記録テーブル名が本番直書きで、`--stage test` すると
 * 本番の服薬記録テーブルに書き込む状態だった。stage ごとに別テーブルを持たせる。
 *
 * 本番テーブル(DrugAndOathRecords)と同じスキーマで作る:
 *   PK (S, HASH) / SK (S, RANGE) / PAY_PER_REQUEST / GSI なし
 *
 * 使い方:
 *   node scripts/create-stage-table.mjs --stage test --dry-run   # 何も作らない
 *   node scripts/create-stage-table.mjs --stage test             # 実際に作る
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb'

const argv = process.argv.slice(2)
const stageIndex = argv.indexOf('--stage')
const stage = stageIndex >= 0 ? argv[stageIndex + 1] : undefined

if (!stage) {
  console.error('Blocked: --stage <name> is required (e.g. --stage test).')
  process.exit(2)
}

// production のテーブルはこのスクリプトの対象外。既に存在し、SST の管理外で
// 運用されている。誤って作成・上書きしないよう名前の段階で弾く。
if (stage === 'production') {
  console.error('Blocked: the production table is not managed by this script.')
  process.exit(2)
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(stage)) {
  console.error(`Blocked: stage must be lowercase alphanumeric (got "${stage}").`)
  process.exit(2)
}

const TABLE_NAME = `DrugAndOathRecords-${stage}`
const REGION = process.env.AWS_REGION || 'us-east-1'

// ガードが正しく効くかを、実際にテーブルを作らずに確認できるようにする
// (BEN-004 F-06: 検証行為そのものがリソースを作ってしまった経験による)。
if (argv.includes('--dry-run')) {
  console.log(`Dry run OK: all guards passed. Would create ${TABLE_NAME} in ${REGION}.`)
  console.log('No AWS call was made.')
  process.exit(0)
}

const client = new DynamoDBClient({ region: REGION })

try {
  await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }))
  console.error(`Blocked: ${TABLE_NAME} already exists in ${REGION}. Nothing to do.`)
  process.exit(2)
} catch (error) {
  if (error.name !== 'ResourceNotFoundException') throw error
}

await client.send(
  new CreateTableCommand({
    TableName: TABLE_NAME,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    Tags: [
      { Key: 'purpose', Value: 'non-production stage' },
      { Key: 'stage', Value: stage },
      { Key: 'data', Value: 'synthetic-only' },
    ],
  })
)

await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: TABLE_NAME })
console.log(`Created ${TABLE_NAME} in ${REGION}.`)
console.log('Put synthetic data only. Never copy production records into it.')
