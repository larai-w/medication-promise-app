# 作業ノート / 引き継ぎ — 2026-07-13（Fable セッション）

このノートは **Codex への引き継ぎ用**。このセッションでやったこと・判明した事実・
未完了タスクをまとめる。次に触る人（Codex）はまずこれと `docs/PROJECT_HANDOFF.md`、
`docs/HUMAN_TASKS.md` を読むこと。

---

## 0. いちばん重要な事実（ハマりどころ）

- **AWS リソースは全部 `us-east-1`**（東京 ap-northeast-1 ではない）。
  - DynamoDB テーブル `DrugAndOathRecords` … us-east-1（実データ17件あり）
  - Alexa Lambda `DrugAndOathFunction` … us-east-1
  - veai.jp API Gateway `e2je3bq5dl.execute-api.us-east-1` / CloudFront `E32Z6UIZTZD6DE` … us-east-1
  - AWS アカウント: `339712703146`
  - → 新規リソースやリージョン指定は **us-east-1 を既定に**。ap-northeast-1 を仮定すると "table not found"。
- **Alexa スキルは2つある（別物・混同注意）**
  - 「お薬の約束」（服薬記録）= このリポジトリ `alexa/` → Lambda `DrugAndOathFunction`。**これが本体**。
  - 「看護師メッセージ」= 別リポジトリ `larai-w/veai-line-message`（LINE 送信）→ Lambda `line-message-function`。**無関係**。

---

## 1. このセッションでやったこと

### Web ホスティングを Amplify → OpenNext + SST に変更（完了・稼働中）
- **理由**: Amplify のマネージド Next.js SSR が **Next.js 16 未対応**（`deploy-manifest.json` を生成できずデプロイ失敗）。
- **採用**: OpenNext 4 + SST v4。CloudFront + Lambda(server) + S3、リージョン ap-northeast-1、DynamoDB だけ us-east-1 参照。
- **本番 URL（現時点・独自ドメイン未設定）**: https://dhr30db6tf09e.cloudfront.net
- **デプロイ方法**: `cd web && npm run deploy`（= `sst deploy --stage production`）。撤去は `npm run sst:remove`。
- 追加ファイル: `web/sst.config.ts`, `web/open-next.config.ts`。詳細は `docs/WEB_HOSTING_OPENNEXT.md`。
- **動作検証済み**: GET（17件取得）/ POST（記録 201）/ DELETE（削除 200）すべて成功。

### 直したバグ
1. `web/src/lib/dynamodb.ts` — 認証情報を手動注入（accessKeyId/secretKey だけ）していたため、
   Lambda ロールの `AWS_SESSION_TOKEN` が抜けて `UnrecognizedClientException`。
   → 手動注入を削除し **SDK 既定の認証チェーンに任せる**（region だけ指定）。
2. DynamoDB リージョン誤設定（ap-northeast-1 と誤認）→ **us-east-1** に修正。

### CI/CD
- GitHub Secrets を実在の Lambda に修正: `LAMBDA_FUNCTION_NAME=DrugAndOathFunction`, `AWS_REGION=us-east-1`。
- IAM ポリシー `github-actions-drug-and-oath` を us-east-1 の `DrugAndOathFunction` ARN に修正。
- CI 全ジョブ green（web lint/build・alexa check・**Lambda 自動デプロイ**が実際に動作）。
- 注意: `sst.config.ts` / `open-next.config.ts` / `.open-next` / `.sst` は Next.js の
  lint(`eslint.config.mjs`)・tsconfig から除外済み（`.sst` 型が gitignore なので CI で消えるため）。

### 旧 Amplify アプリの扱い
- `medication-promise-app`（appId `d3tr8elpw0dz9m`, us-east-1）はプラットフォームを WEB に戻し、
  auto-build を停止。**もう使わない。不要なら削除可**（`aws amplify delete-app --app-id d3tr8elpw0dz9m --region us-east-1`）。

### コミット（main に push 済み）
- `feat: host web on AWS via OpenNext + SST (replace Amplify)`（fe91982）
- `docs: mark H-05 web deploy done`（1a42682）
- ほか docs/HUMAN_TASKS 更新、DYNAMODB_REGION 対応など。

---

## 2. 未完了・次にやること（Codex 向けタスク）

### T-A: 独自ドメイン割り当て（未着手・要人間の意思決定 → 下の HUMAN 参照）
- 推奨は **`kusuri.veai.jp`（サブドメイン方式）**。SST でやるなら `sst.config.ts` の `Nextjs` に
  `domain: { name: 'kusuri.veai.jp', dns: sst.aws.dns() }` を追加 → `npm run deploy`。
  Route53 に veai.jp のホストゾーンがある前提（要確認）。ACM 証明書は SST が自動発行。
- もしパス方式 `veai.jp/kusuri` を選ぶ場合は、
  1. `web/next.config.ts` に `basePath: '/kusuri'` を追加、
  2. 既存 veai.jp CloudFront `E32Z6UIZTZD6DE` にオリジン（SST の CloudFront か Lambda FunctionURL）＋
     ビヘイビア `/kusuri*` を追加。**本番 veai.jp に手を入れるので慎重に**。
- **名前が長い `veai.jp/drug-and-oath` は非推奨**（覚えにくい・改修量同じ）。

### T-B: Web CD の自動化（任意）
- 今は Web デプロイは手動 `npm run deploy`。GitHub Actions で `sst deploy` を回すなら、
  CloudFront/Lambda/S3/IAM 作成権限を持つ専用 IAM ロールが別途必要（Alexa CD 用の
  `github-actions-drug-and-oath` は権限範囲が違う）。頻度が上がってからで良い。

### T-C: `PROJECT_HANDOFF.md` の env var 記述が一部古い
- `AWS_ACCESS_KEY_ID/SECRET` をローカルで使う前提の記述が残っている。実際は SDK 既定チェーンで
  よい（ローカルは `~/.aws` か SSO 推奨）。気づいたら整理。

### 既存の未完了（`docs/HUMAN_TASKS.md` の Fable 依頼枠）
- T23 Cognito 認証、T24 マルチ患者対応 は未着手（`senior-implementer` 委譲想定）。

---

## 3. 環境・コマンド早見

```bash
cd drug-and-oath           # ここが Git リポジトリ

# Web（Next.js 16）
cd web
npm run dev                # ローカル開発
npm run build              # ビルド
npm run lint               # lint
npm run deploy             # ★AWS 本番デプロイ（OpenNext+SST）
npm run sst:remove         # ★撤去

# Alexa
cd alexa
npm run zip                # skill.zip 生成（CI が DrugAndOathFunction に自動デプロイ）
```

- 本番 Web URL: https://dhr30db6tf09e.cloudfront.net
- リポジトリ: https://github.com/larai-w/medication-promise-app
