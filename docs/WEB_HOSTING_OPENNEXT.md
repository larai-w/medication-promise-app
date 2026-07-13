# Web ホスティング — OpenNext + SST (AWS)

作成日: 2026-07-13

Web アプリ（`web/`、Next.js 16）は **OpenNext + SST v4** で AWS にデプロイします。
CloudFront + Lambda（サーバー）+ S3（静的アセット）の構成で、**純 AWS・低コスト**（月数百円レベル、
無料枠内に収まる想定）で Next.js 16 の SSR / API ルートがそのまま動きます。

> **なぜ Amplify をやめたか**: Amplify のマネージド Next.js SSR が Next.js 16 をまだ認識できず、
> `deploy-manifest.json` を生成できずデプロイに失敗した（framework が "Next.js - SSR" にならない）。
> OpenNext は `next >=16.2.6` に対応しているため、こちらに切り替えた。

---

## 構成

| リソース | 役割 |
|---------|------|
| CloudFront | エッジ配信（`*.cloudfront.net` の URL） |
| Lambda (server) | SSR + API ルート（`/api/records` など） |
| S3 | 静的アセット（JS/CSS/画像） |
| Lambda (image/revalidation/warmer) | OpenNext 付随機能 |

- Web インフラ（CloudFront/Lambda/S3）のリージョン: **ap-northeast-1**（東京。利用者に近い）
- **DynamoDB テーブル `DrugAndOathRecords` は us-east-1**（Alexa Lambda・API Gateway と同じ veai 本拠リージョン）。
  Web の Lambda は `DYNAMODB_REGION=us-east-1` でクロスリージョン参照する。
- サーバー Lambda に us-east-1 テーブルへの最小権限を付与済み
- 環境変数: `DYNAMODB_REGION=us-east-1` / `DYNAMODB_TABLE_NAME` / `USER_ID`（`sst.config.ts` に定義）

> **重要な教訓**: このアプリの AWS リソースは基本 us-east-1 に集約されている
> （DynamoDB・Alexa Lambda `DrugAndOathFunction`・veai.jp API Gateway）。
> 新しいリソースを足すときは us-east-1 を確認すること。

## ファイル

| ファイル | 内容 |
|---------|------|
| `web/open-next.config.ts` | OpenNext のビルド設定（既定構成） |
| `web/sst.config.ts` | SST のデプロイ定義（CloudFront/Lambda/S3 + IAM） |

## コマンド（`web/` で実行）

```bash
# デプロイ（本番）
npm run deploy            # = sst deploy --stage production

# ローカル開発（AWS 上のライブ Lambda に接続）
npm run sst:dev

# 撤去（作成したリソースを全削除）
npm run sst:remove
```

## 初回デプロイ後にやること

1. `sst deploy` の出力に表示される **CloudFront の URL** をメモする
2. その URL でアプリの動作確認（服薬記録のワンタップ・PDF・月次画面）
3. 独自ドメイン（veai.jp 配下）に載せる場合は下記「veai.jp 統合」を参照

## veai.jp 統合（任意・後回し可）

2 通り:

- **A. SST に独自ドメインを設定**（推奨・簡単）
  `sst.config.ts` の `Nextjs` に `domain: 'kusuri.veai.jp'` を追加し、
  Route53 のホストゾーンを SST に管理させる（サブドメイン方式）。
- **B. 既存 veai.jp CloudFront に `/kusuri*` ビヘイビアを追加**
  この場合は Next.js 側に `basePath: '/kusuri'` の設定が必要。
  既存 distribution `E32Z6UIZTZD6DE` にオリジン（SST が作った CloudFront か Lambda）を追加する。

## CI/CD（任意）

GitHub Actions で `sst deploy` を自動化する場合、Web 用に別途 IAM 権限
（CloudFront/Lambda/S3/IAM の作成権限）が必要。Lambda（Alexa）CD 用の
`github-actions-drug-and-oath` ユーザーとは権限範囲が異なるので、専用ロール推奨。
まずは手動 `npm run deploy` で運用し、頻度が上がったら自動化する。
