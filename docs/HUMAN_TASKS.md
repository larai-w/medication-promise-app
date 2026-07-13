# 人間がやるタスクリスト — Drug and Oath

最終更新: 2026-07-12（最終自動化後）

Fable / Sonnet / Opus が実行できず、**人間のアカウントアクセスが必要なタスク**をまとめています。
優先度順に並んでいます。上から順にやればOKです。

---

## ステータス凡例

- ⬜ 未着手
- 🔄 進行中
- ✅ 完了

---

## PHASE 0 — 今すぐ（合計 約60〜75分）

### H-01 ✅ GitHub に main ブランチをプッシュ
**⏱ 2分** | 優先度: P0 | **完了済み**

---

### H-02 ✅ Alexa リマインダー権限をオンにする
**⏱ 3分** | 優先度: P0 | **完了済み（Echo からリマインダーが鳴ることで確認）**

---

### H-03 ⬜ Alexa インタラクションモデルをデプロイ
**⏱ 10〜15分**（ビルド待ちを含む） | 優先度: P0

「SetRemindersIntent」が `alexa/interaction-model.json` に追加されており、コンソールへの反映が必要。

**方法（コンソール）**:
1. Alexa Developer Console → 「お薬の約束」→ JSONエディタ
2. `drug-and-oath/alexa/interaction-model.json` の内容をコピペ
3. 「モデルを保存」→「モデルをビルド」（ビルドに5〜10分かかる）

---

### H-04 ⬜ Alexa Lambda（skill.zip）をデプロイ
**⏱ 10分** | 優先度: P0

`recordMedication` の重複ロジック統合が含まれているので必ずデプロイ。

```bash
cd drug-and-oath/alexa
npm run zip
```

AWS Lambda コンソール → 対象の関数 → 「コードをアップロード」→ skill.zip を選択 → 「デプロイ」

---

### H-05 🔄 Web を OpenNext + SST で AWS にデプロイ
**⏱ 5分（確認のみ）** | 優先度: P0

**Amplify は Next.js 16 SSR 非対応のため中止。OpenNext + SST に切り替え。**
詳細は `docs/WEB_HOSTING_OPENNEXT.md` を参照。

Fable が自動化済み:
- ✅ `web/open-next.config.ts` / `web/sst.config.ts` を作成
- ✅ OpenNext ビルド検証成功（Next.js 16.2.9 対応確認）
- ✅ DynamoDB 最小権限をサーバー Lambda に付与
- ✅ `npm run deploy`（= `sst deploy --stage production`）でデプロイ実行

**あなたがやること**: デプロイ完了後に表示される CloudFront の URL で動作確認するだけ。
再デプロイは `cd web && npm run deploy` のみ。

**旧 Amplify アプリ** `d3tr8elpw0dz9m` はプラットフォームを `WEB` に戻し、
自動ビルドを停止済み（不要になったら削除可）。

---

### H-06 ⬜ デプロイ後の動作確認
**⏱ 10〜15分** | 優先度: P0

| 確認項目 | 合格基準 |
|---------|---------|
| Web: トップページ | 今日の5タイミングが表示される |
| Web: 服薬記録 | ワンタップで記録 → 画面が即更新される |
| Web: 削除 | モーダルが出て、キャンセルできる（confirm() ではない） |
| Web: 月次PDF | ダウンロードできる・日本語が文字化けしない |
| Web: 月次画面 | 完了率 % が表示される |
| DynamoDB | コンソールでアイテムが作成されている |
| Alexa | 「朝の薬を飲んだ」→ 記録される |
| Alexa | 「リマインダーを設定して」→ 5つ設定される |

---

## PHASE 1 — 今週中（合計 約35〜45分）

### H-07 ⬜ GitHub ブランチ保護を設定
**⏱ 5分** | 優先度: P1

GitHub → `larai-w/medication-promise-app` → Settings → Branches → Add rule:

```
Branch name pattern: main
✅ Require a pull request before merging
✅ Require status checks to pass before merging
   チェック項目: "Web lint and build"、"Alexa package check"
✅ Block direct pushes
```

これをすると main への直接プッシュが禁止され、CI が通ったPRだけマージできるようになる。

---

### H-08 ✅ GitHub Secrets に AWS 認証情報を設定
**⏱ 15〜20分** | 優先度: P1 | **Fable が自動化済み**

Fable が自動化済み:
- ✅ IAM ユーザー `github-actions-drug-and-oath` 作成済み
- ✅ IAM ポリシーを `DrugAndOathFunction`（us-east-1）に修正
- ✅ GitHub Secrets 4つ設定済み:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=us-east-1`, `LAMBDA_FUNCTION_NAME=DrugAndOathFunction`

次の `git push` から Lambda の CD が自動で動きます。

---

### H-09 ⬜ CloudFront 問題の解決（veai.jp を整理したい場合）
**⏱ 10〜20分** | 優先度: P1

まず現状確認:
- AWS Console → Service Quotas → CloudFront → `Distributions per AWS account` の現在値を確認
- 上限に当たっているなら「クォータを引き上げる」ボタンを押す（無料）

Drug and Oath を既存の veai.jp の CloudFront distribution に乗せる場合は Fable に「basePath を /kusuri に設定して」と依頼してから、この CloudFront 設定を行う:
1. 既存 distribution → オリジン → 「オリジンを作成」→ Amplify の URL を指定
2. ビヘイビア → 「ビヘイビアを作成」→ パスパターン `/kusuri*`、オリジンを上記に設定

---

## PHASE 2 — 10人ユーザー達成後

### H-10 ⬜ Alexa スキルをスキルストアに公開申請
**⏱ 30〜60分** | 優先度: P1

Alexa Developer Console → スキル → 「公開」タブ:
- スキル名: 「お薬の約束」
- 説明文: 「在宅介護の方のための服薬記録スキル。朝・昼・晩・夜8時・夜9時の服薬をアレクサに話しかけるだけで記録できます。」
- カテゴリ: 健康とフィットネス
- プライバシーポリシー URL: （別途用意が必要）
- テスト済みと申告 → 審査提出（審査に 2〜4 週間かかる）

---

### H-11 ⬜ note に開発ストーリーを投稿
**⏱ 60〜90分**（執筆時間を含む） | 優先度: P1

**題材の例**:
- 「アレクサで親の服薬記録を自動化した話」
- 「在宅介護を支えるアプリを個人開発した記録」

**含める要素**:
- 作った理由（介護の現場でのリアルな課題）
- アプリの使い方の動画 or スクリーンショット
- Alexa スキルの URL と Web アプリの URL

**公開先**: note.com（介護・医療系の読者が多く、SEO効果が高い）

---

### H-12 ⬜ 医療関係者3〜5人に個別連絡
**⏱ 30〜60分**（連絡文作成と送付） | 優先度: P0（最重要）

`docs/GROWTH_PLAN.md` の「紹介スクリプト例」を使って連絡する。
訪問看護師・ケアマネジャーなど、患者家族に接触できる人が理想。

> 「在宅介護の服薬記録アプリを作りました。担当患者のご家族を1〜2人紹介してもらえますか？無料でセットアップします。」

**これが最初の10人を集める最速の方法。** アプリストア・SNSより先にやる。

---

### H-13 ⬜ 地元グループホーム3〜5軒にアプローチ
**⏱ 1〜2時間**（リスト作成・連絡） | 優先度: P2

定員29人以下の小規模施設。意思決定が速く、現場スタッフが即判断できる。
「3ヶ月無料トライアル、フィードバックをくれればOK」で提案する。

H-12 で10人達成してから動く。

---

## Fableへの依頼が必要なタスク（コード変更が伴うもの）

人間が何かを決めたら、Fable に依頼して実装してもらうタスク:

| 前提 | Fableへの依頼内容 |
|------|----------------|
| veai.jp の CloudFront に乗せると決めた | 「basePath を /kusuri に設定して」 |
| Alexa スキルストア公開のプライバシーポリシーが必要 | 「プライバシーポリシーページ（/privacy）を作って」 |
| Cognito 認証を導入する時期が来た | 「T23（認証基盤）を senior-implementer にやらせて」 |
| CD 自動化したい（H-08 完了後） | 「T16（Lambda 自動デプロイ）を実装して」 |

---

## 全タスク一覧（時間サマリー）

| タスク | フェーズ | 時間 | ステータス |
|--------|---------|------|-----------|
| H-01 git push | 今すぐ | 2分 | ⬜ |
| H-02 Alexa リマインダー権限 | 今すぐ | 3分 | ⬜ |
| H-03 インタラクションモデル デプロイ | 今すぐ | 10〜15分 | ⬜ |
| H-04 Lambda デプロイ | 今すぐ | 10分 | ⬜ |
| H-05 Amplify デプロイ | 今すぐ | 20〜30分 | ⬜ |
| H-06 デプロイ後動作確認 | 今すぐ | 10〜15分 | ⬜ |
| **PHASE 0 合計** | | **55〜75分** | |
| H-07 ブランチ保護 | 今週中 | 5分 | ⬜ |
| H-08 GitHub Secrets | 今週中 | 15〜20分 | ⬜ |
| H-09 CloudFront 整理 | 今週中 | 10〜20分 | ⬜ |
| **PHASE 1 合計** | | **30〜45分** | |
| H-10 Alexa スキルストア申請 | 10人後 | 30〜60分 | ⬜ |
| H-11 note 記事投稿 | 10人後 | 60〜90分 | ⬜ |
| H-12 医療関係者への連絡 | 今すぐ | 30〜60分 | ⬜ |
| H-13 グループホームアプローチ | 10人後 | 1〜2時間 | ⬜ |
| **PHASE 2 合計** | | **2.5〜4時間** | |
| **総合計** | | **約5〜7時間** | |
