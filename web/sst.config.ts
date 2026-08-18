/// <reference path="./.sst/platform/config.d.ts" />

// Drug and Oath — Web (Next.js 16) on AWS via OpenNext.
// Deploys a regional Lambda (server) + S3 assets + CloudFront in ap-northeast-1.
export default $config({
  app(input) {
    return {
      name: 'drug-and-oath-web',
      // production は誤削除を防ぐため retain / protect
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: ['production'].includes(input?.stage ?? ''),
      home: 'aws',
      providers: {
        aws: { region: 'ap-northeast-1' },
      },
    }
  },
  async run() {
    const mvpAccessCode = new sst.Secret('MvpAccessCode')
    const mvpSessionSecret = new sst.Secret('MvpSessionSecret')
    const cognitoUserPoolId = new sst.Secret('CognitoUserPoolId')
    const cognitoWebClientId = new sst.Secret('CognitoWebClientId')
    const cognitoHostedUiHost = new sst.Secret('CognitoHostedUiHost')

    // DynamoDB テーブル・Alexa Lambda・API Gateway は us-east-1（veai エコシステムの本拠）。
    // Web インフラ（CloudFront/Lambda）は日本利用者に近い ap-northeast-1 に置き、
    // DynamoDB だけクロスリージョンで us-east-1 を参照する。
    //
    // stage 分離（2026-08-18・F-07）。従来は記録テーブル名・ドメイン・世帯IDが
    // すべて本番直書きで、`--stage test` すると本番の服薬記録テーブルに書き込む
    // 状態だった。健康データが混ざるのは取り返しがつかないので、production 以外は
    // 別テーブル・別世帯を指す。
    const isProduction = $app.stage === 'production'
    const recordsTableName = isProduction
      ? 'DrugAndOathRecords'
      : `DrugAndOathRecords-${$app.stage}`
    const tableArn = `arn:aws:dynamodb:us-east-1:339712703146:table/${recordsTableName}`
    // ADR-0007はProposed。権限候補はあるが収集は明示的に無効化する。
    //
    // 計測テーブルは必ず stage を名前に含める(BEN-004 承認ゲート F-03)。
    // 無印を production 用にすると `stage === 'production' ? base : ...` という
    // 条件分岐が要り、stage が未設定・空・想定外のときに本番へ倒れる。
    // 一律で `${base}-${stage}` にすれば、test 環境から本番テーブルへ到達する
    // 経路が構造的に存在しなくなる。合成データによる本番汚染はTTL35日消えない。
    const metricsTableName = `veai-ben004-metrics-${$app.stage}`
    const metricsTableArn =
      `arn:aws:dynamodb:us-east-1:339712703146:table/${metricsTableName}`
    const tokyoAlertTopicArn =
      'arn:aws:sns:ap-northeast-1:339712703146:veai-ecosystem-alerts'
    const virginiaAlertTopicArn =
      'arn:aws:sns:us-east-1:339712703146:veai-ecosystem-alerts'

    const web = new sst.aws.Nextjs('Web', {
      path: '.',
      // production 以外はドメインを付けない。CloudFront の既定URLで足りるうえ、
      // ACM 証明書と DNS 検証を待たずに test 環境を立てられる。
      // 付けてしまうと本番ドメインを奪い合う（F-07）。
      ...(isProduction ? { domain: 'kusuri.veai.jp' } : {}),
      environment: {
        DYNAMODB_REGION: 'us-east-1',
        DYNAMODB_TABLE_NAME: recordsTableName,
        // 世帯IDも分ける。テーブルを分けても同じ世帯IDだと、取り違えたときに
        // 本番と同じキー空間を触ることになる。
        USER_ID: isProduction ? 'default-user' : `test-user-${$app.stage}`,
        HOUSEHOLD_ID: isProduction ? 'owner-household' : `test-household-${$app.stage}`,
        HOUSEHOLD_PARTITION_MODE: 'household',
        WEB_AUTH_MODE: 'cognito',
        // Alexa household cutover and legacy-partition disposition are release gates.
        ACCOUNT_DELETION_ENABLED: 'false',
        // production 以外は CloudFront の既定URLになるが、環境変数を組み立てる
        // 時点では web.url を参照できない（自己参照になる）。test では Cognito の
        // リダイレクト先が要らない前提で空にし、必要なら sst.Secret で渡す。
        APP_ORIGIN: isProduction ? 'https://kusuri.veai.jp' : '',
        COGNITO_USER_POOL_ID: cognitoUserPoolId.value,
        COGNITO_WEB_CLIENT_ID: cognitoWebClientId.value,
        COGNITO_HOSTED_UI_HOST: cognitoHostedUiHost.value,
        MVP_ACCESS_GATE: 'enabled',
        MVP_ACCESS_CODE: mvpAccessCode.value,
        MVP_SESSION_SECRET: mvpSessionSecret.value,
        METRICS_TABLE: metricsTableName,
        METRICS_COLLECTION_ENABLED: 'false',
      },
      // サーバー Lambda に既存 DynamoDB テーブルへの最小権限を付与 + Bedrock
      permissions: [
        {
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:DeleteItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:BatchWriteItem',
            'dynamodb:ConditionCheckItem',
            'dynamodb:TransactWriteItems',
          ],
          resources: [tableArn, `${tableArn}/index/*`],
        },
        {
          // BEN-004 メトリクス書き込み（PutItemのみ・最小権限）
          actions: ['dynamodb:PutItem'],
          resources: [metricsTableArn],
        },
        {
          actions: [
            'bedrock:InvokeModel',
          ],
          resources: ['arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0'],
        },
      ],
    })

    const alarmDefaults = {
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      evaluationPeriods: 1,
      period: 60,
      statistic: 'Sum',
      threshold: 1,
      treatMissingData: 'notBreaching',
    }
    const webLogGroupName = web.nodes.server.nodes.logGroup.apply((logGroup) => {
      if (!logGroup) throw new Error('Web server log group is required for auth monitoring')
      return logGroup.name
    })

    // Reuse the already-confirmed ecosystem alert topics; do not create or enroll
    // a new email/SNS destination implicitly.
    new aws.cloudwatch.MetricAlarm('WebServerErrors', {
      ...alarmDefaults,
      name: `${$app.name}-${$app.stage}-web-errors`,
      alarmDescription: 'The medication-promise web Lambda returned an error.',
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensions: { FunctionName: web.nodes.server.name },
      alarmActions: [tokyoAlertTopicArn],
    })

    new aws.cloudwatch.MetricAlarm('WebServerThrottles', {
      ...alarmDefaults,
      name: `${$app.name}-${$app.stage}-web-throttles`,
      alarmDescription: 'The medication-promise web Lambda was throttled.',
      namespace: 'AWS/Lambda',
      metricName: 'Throttles',
      dimensions: { FunctionName: web.nodes.server.name },
      alarmActions: [tokyoAlertTopicArn],
    })

    new aws.cloudwatch.LogMetricFilter('AuthenticationOperationalFailures', {
      name: `${$app.name}-${$app.stage}-auth-operational-failures`,
      logGroupName: webLogGroupName,
      pattern: '"AUTH_OPERATIONAL_FAILURE"',
      metricTransformation: {
        name: 'AuthenticationOperationalFailures',
        namespace: 'DrugAndOath/Operational',
        value: '1',
      },
    })

    new aws.cloudwatch.MetricAlarm('AuthenticationOperationalFailureAlarm', {
      ...alarmDefaults,
      name: `${$app.name}-${$app.stage}-auth-operational-failures`,
      alarmDescription: 'Cognito configuration, callback, or membership lookup failed.',
      namespace: 'DrugAndOath/Operational',
      metricName: 'AuthenticationOperationalFailures',
      period: 300,
      alarmActions: [tokyoAlertTopicArn],
    })

    new aws.cloudwatch.MetricAlarm('RecordsTableSystemErrors', {
      ...alarmDefaults,
      name: `${$app.name}-${$app.stage}-records-system-errors`,
      alarmDescription: 'DynamoDB reported a server-side error for the records table.',
      namespace: 'AWS/DynamoDB',
      metricName: 'SystemErrors',
      dimensions: { TableName: recordsTableName },
      region: 'us-east-1',
      alarmActions: [virginiaAlertTopicArn],
    })

    new aws.cloudwatch.MetricAlarm('RecordsTableThrottles', {
      ...alarmDefaults,
      name: `${$app.name}-${$app.stage}-records-throttles`,
      alarmDescription: 'A request to the records table was throttled.',
      namespace: 'AWS/DynamoDB',
      metricName: 'ThrottledRequests',
      dimensions: { TableName: recordsTableName },
      region: 'us-east-1',
      alarmActions: [virginiaAlertTopicArn],
    })
  },
})
