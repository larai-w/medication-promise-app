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

    // DynamoDB テーブル・Alexa Lambda・API Gateway は us-east-1（veai エコシステムの本拠）。
    // Web インフラ（CloudFront/Lambda）は日本利用者に近い ap-northeast-1 に置き、
    // DynamoDB だけクロスリージョンで us-east-1 を参照する。
    const tableArn =
      'arn:aws:dynamodb:us-east-1:339712703146:table/DrugAndOathRecords'

    new sst.aws.Nextjs('Web', {
      path: '.',
      environment: {
        DYNAMODB_REGION: 'us-east-1',
        DYNAMODB_TABLE_NAME: 'DrugAndOathRecords',
        USER_ID: 'default-user',
        MVP_ACCESS_GATE: 'enabled',
        MVP_ACCESS_CODE: mvpAccessCode.value,
        MVP_SESSION_SECRET: mvpSessionSecret.value,
      },
      // サーバー Lambda に既存 DynamoDB テーブルへの最小権限を付与
      permissions: [
        {
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:DeleteItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:BatchWriteItem',
          ],
          resources: [tableArn, `${tableArn}/index/*`],
        },
      ],
    })
  },
})
