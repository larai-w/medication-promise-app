#!/usr/bin/env node
/**
 * BEN-004 計測テーブルを、ガバナンス承認が下りた後にだけ作成する。
 *
 * ADR-0007 制約5 は「ADR が Accepted になるまでテーブル作成を禁止する」と
 * 定めている。これまで Medication Promise 側にはそれを機械的に止める仕組みが
 * 無く、GutPacer 側 (scripts/create-metrics-table.mjs) にだけ存在していた
 * (BEN-004 承認ゲート F-04)。本スクリプトで対を揃える。
 *
 * 使い方:
 *   METRICS_GOVERNANCE_APPROVED=ADR-0007-Accepted \
 *   METRICS_TABLE_NAME=veai-ben004-metrics-test \
 *     node scripts/create-metrics-table.mjs --owner-approved
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb'

if (
  process.env.METRICS_GOVERNANCE_APPROVED !== 'ADR-0007-Accepted' ||
  !process.argv.includes('--owner-approved')
) {
  console.error('Blocked: accepted ADR-0007 and explicit owner approval are required.')
  process.exit(2)
}

// テーブル名は明示必須。既定値を置くと test から本番名を作ってしまう (F-03)。
// stage を必ず名前に含めること: veai-ben004-metrics-test / -production
const TABLE_NAME = process.env.METRICS_TABLE_NAME
if (!TABLE_NAME) {
  console.error('Blocked: METRICS_TABLE_NAME is required (e.g. veai-ben004-metrics-test).')
  console.error('         Do not rely on a default: it would point at production.')
  process.exit(2)
}
// 「ハイフンがあれば stage 付き」では不十分。"veai-ben004-metrics" 自体が
// ハイフンを含むため素通りしてしまう。基底名 + stage の形を厳密に要求する。
const METRICS_TABLE_BASE = 'veai-ben004-metrics'
if (!new RegExp(`^${METRICS_TABLE_BASE}-[a-z0-9][a-z0-9-]*$`).test(TABLE_NAME)) {
  console.error(`Blocked: METRICS_TABLE_NAME must be "${METRICS_TABLE_BASE}-<stage>" (got "${TABLE_NAME}").`)
  console.error('         A bare base name would be the production table.')
  process.exit(2)
}

// DynamoDB は us-east-1（veai エコシステムの本拠。sst.config.ts と揃える）。
const REGION_INDEX = process.argv.indexOf('--region')
const REGION = REGION_INDEX >= 0 ? process.argv[REGION_INDEX + 1] : (process.env.AWS_REGION || 'us-east-1')
// ガードが正しく拒否することを確認するために、実際にテーブルを作る必要はない。
// --dry-run は全チェックを通したうえで AWS 呼び出しの直前で止まる。
// これが無いと「ガードの検証行為そのものが ADR-0007 制約5 違反になる」
// (2026-08-17 に GutPacer 側で実際に発生。F-06)。
if (process.argv.includes('--dry-run')) {
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
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    // ADR-0007 制約3: 保存期間35日。目印としてタグにも残す（RB-0016 の削除前確認で使う）。
    Tags: [
      { Key: 'purpose', Value: 'ben-004-metrics' },
      { Key: 'retention', Value: '35d' },
      { Key: 'adr', Value: 'ADR-0007' },
    ],
  })
)

await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: TABLE_NAME })

await client.send(
  new UpdateTimeToLiveCommand({
    TableName: TABLE_NAME,
    TimeToLiveSpecification: { Enabled: true, AttributeName: 'ttl' },
  })
)

console.log(`Created ${TABLE_NAME} in ${REGION}; TTL enabled on "ttl".`)
