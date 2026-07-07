# Drug and Oath — タスクリスト

最終更新: 2026-07-08

ステータス凡例: ✅ 完了 / 🔄 進行中 / ⏳ 待機 / ❌ ブロック中

優先度: P0（即対応）/ P1（今スプリント）/ P2（次スプリント）/ P3（バックログ）

---

## Sprint 1: 品質固め・本番化（〜2026-07末）

| # | タスク | 優先度 | サイズ | ステータス | 担当 |
|---|--------|--------|--------|------------|------|
| T01 | Alexa DynamoDB重複ロジックを統合（index.mjs → dynamodb.mjs） | P0 | S | ✅ 完了 | Fable |
| T02 | Alexa・Webの未コミット変更をコミット | P0 | S | ✅ 完了 | Fable |
| T03 | ドキュメント・CI設定ファイルをコミット | P0 | S | ✅ 完了 | Fable |
| T04 | Fableスキル一覧をMDファイルとして保存（docs/FABLE_SKILLS.md） | P1 | S | ✅ 完了 | Fable |
| T05 | タスクリストをMDファイル化（docs/TASKS.md） | P1 | S | ✅ 完了 | Fable |
| T06 | GitHubに main ブランチをプッシュしてCIを有効化 | P0 | S | ⏳ 待機 | 手動 |
| T07 | main ブランチ保護ルール設定（PR必須・CI必須） | P1 | S | ⏳ 待機 | 手動 |
| T08 | Alexa開発者コンソールでリマインダー権限を有効化 | P0 | S | ⏳ 待機 | 手動 |
| T09 | Alexaインタラクションモデルをデプロイ | P0 | S | ⏳ 待機 | 手動 |
| T10 | Alexa Lambda（skill.zip）をデプロイ | P0 | M | ⏳ 待機 | 手動 |
| T11 | API エラーハンドリング追加（クライアント側トースト通知） | P1 | S | ⏳ 待機 | Fable |
| T12 | 削除確認を `confirm()` からモーダルUIに変更 | P1 | S | ⏳ 待機 | Fable |
| T13 | APIルートのスモークテスト実装 | P1 | M | ⏳ 待機 | Fable |

---

## Sprint 2: UX改善・Alexa強化（〜2026-10末）

| # | タスク | 優先度 | サイズ | ステータス | 担当 |
|---|--------|--------|--------|------------|------|
| T14 | Vercel に Web をデプロイ（CD設定） | P1 | M | ⏳ 待機 | 手動+Fable |
| T15 | GitHub Secrets に AWS 認証情報を設定 | P1 | S | ⏳ 待機 | 手動 |
| T16 | GitHub Actions CD（Lambda 自動デプロイ） | P1 | M | ⏳ 待機 | Fable |
| T17 | リマインダー応答時の自動記録（Alexa Proactive Events） | P1 | L | ⏳ 待機 | Fable |
| T18 | PDF にメモ・患者名を含める | P1 | S | ⏳ 待機 | Fable |
| T19 | 服薬コンプライアンスグラフ（週次・月次集計） | P2 | M | ⏳ 待機 | Fable |
| T20 | Web Push 通知（未記録アラート） | P2 | M | ⏳ 待機 | Fable |
| T21 | PWA 対応（オフライン基盤） | P2 | L | ⏳ 待機 | Fable |
| T22 | 月次画面の印刷CSS最適化 | P2 | S | ⏳ 待機 | Fable |

---

## Sprint 3: マルチユーザー化（〜2027-01末）

| # | タスク | 優先度 | サイズ | ステータス | 担当 |
|---|--------|--------|--------|------------|------|
| T23 | 認証基盤（NextAuth.js + Cognito） | P1 | XL | ⏳ 待機 | Fable |
| T24 | 複数患者管理UI | P1 | XL | ⏳ 待機 | Fable |
| T25 | DynamoDB スキーマ移行スクリプト | P1 | M | ⏳ 待機 | Fable |
| T26 | 施設向けダッシュボード | P2 | L | ⏳ 待機 | Fable |
| T27 | CSV エクスポート | P2 | S | ⏳ 待機 | Fable |
| T28 | 個人情報保護法・セキュリティレビュー対応 | P0 | L | ⏳ 待機 | Fable |

---

## 手動で対応が必要なタスク（Fableが実行できないもの）

以下はGitHub・AWS・Alexaコンソールへのアクセスが必要なため、手動で実施する:

### T06: GitHub push
```bash
cd drug-and-oath
git push origin main
```
→ これで CI が次の PR から自動実行される。

### T07: ブランチ保護（GitHub Settings > Branches）
- `main` ブランチに以下を設定:
  - Require a pull request before merging
  - Require status checks to pass before merging（CI: Web lint and build / Alexa package check）
  - Block direct pushes

### T08: Alexa リマインダー権限（Alexa Developer Console）
- スキルの「Permissions」タブ → 「Reminders」をオン

### T09: インタラクションモデルのデプロイ
```bash
cd drug-and-oath/alexa
# ASK CLI を使用
ask deploy --target interaction-model
# または Alexa Developer Console で interaction-model.json を手動アップロード
```

### T10: Lambda デプロイ
```bash
cd drug-and-oath/alexa
npm run zip
# skill.zip を AWS Lambda コンソールでアップロード
# または ask deploy --target lambda
```

---

## 完了済みタスク（Sprint 0）

| # | タスク | 完了日 |
|---|--------|--------|
| - | Next.js 初期セットアップ・ルーティング | 〜2026-07-06 |
| - | DynamoDB 設計・ヘルパー実装 | 〜2026-07-06 |
| - | メイン画面（5タイミング表示・記録） | 〜2026-07-06 |
| - | 追加・編集モーダル | 〜2026-07-06 |
| - | 月次カレンダー画面 | 〜2026-07-06 |
| - | PDF 生成（日本語対応） | 〜2026-07-06 |
| - | Alexa スキル（5タイミング記録） | 〜2026-07-06 |
| - | GitHub Actions CI ワークフロー作成 | 〜2026-07-06 |
| - | GitHub Issue テンプレート | 〜2026-07-06 |
