import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// F-07: 従来 sst.config.ts は記録テーブル名・ドメイン・世帯IDが本番直書きで、
// `--stage test` すると本番の服薬記録テーブルに書き込む状態だった。
// 健康データが混ざるのは取り返しがつかないので、production 以外は別を指すことを固定する。
//
// 文字列の完全一致に依存すると、実装を強くしたときにテストが落ちる（BEN-004 F-08 の教訓）。
// ここでは「本番値が無条件に現れないこと」を検証する。
const config = await readFile(new URL('../sst.config.ts', import.meta.url), 'utf8')

/** 行がコメントでも分岐内でもなく、本番値をそのまま代入していれば true */
function assignedUnconditionally(source: string, productionValue: string) {
  return source
    .split('\n')
    .filter((line) => line.includes(productionValue))
    .filter((line) => !line.trim().startsWith('//'))
    .some((line) => !line.includes('isProduction'))
}

test('production-only values never appear outside an isProduction branch', () => {
  for (const value of ["'kusuri.veai.jp'", "'owner-household'", "'default-user'"]) {
    assert.equal(
      assignedUnconditionally(config, value),
      false,
      `${value} が isProduction の分岐外で使われている`
    )
  }
})

test('the records table name is derived from the stage', () => {
  assert.match(
    config,
    /const recordsTableName = isProduction\s*\?\s*'DrugAndOathRecords'\s*:\s*`DrugAndOathRecords-\$\{\$app\.stage\}`/,
    'recordsTableName が stage から導出されていない'
  )
  // ARN と環境変数とアラームが、その導出値を使っていること
  assert.match(config, /table\/\$\{recordsTableName\}/, 'tableArn が recordsTableName を使っていない')
  assert.match(config, /DYNAMODB_TABLE_NAME: recordsTableName/, '環境変数が recordsTableName を使っていない')
  assert.match(config, /dimensions: \{ TableName: recordsTableName \}/, 'アラームが recordsTableName を使っていない')
})

test('the production domain is attached only in production', () => {
  assert.match(
    config,
    /\.\.\.\(isProduction \? \{ domain: 'kusuri\.veai\.jp' \} : \{\}\)/,
    'ドメインが production 限定になっていない'
  )
})
