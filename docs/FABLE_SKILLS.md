# Drug and Oath — Fable 開発スキルリファレンス

このファイルは Claude Fable 5（および Claude Code エージェント）が本プロジェクトを開発・保守するときに使う
Claude Code スキルの一覧と、このリポジトリでの具体的な使い方をまとめたものです。

新しいセッションを開始するエージェントは、このファイルを読んでからコードに触れてください。

---

## クイックリファレンス

| スキル | 主な用途 | このプロジェクトでの使いどころ |
|--------|---------|-------------------------------|
| `/init` | CLAUDE.md 生成 | 新エージェントのオンボーディング |
| `/run` | アプリ起動・目視確認 | Next.js dev server + Alexa シミュレーター |
| `/verify` | 変更後の動作検証 | 服薬記録→DynamoDB ラウンドトリップ確認 |
| `/code-review` | 差分レビュー | Alexa 重複ロジック・API エラーハンドリング検出 |
| `/security-review` | セキュリティ検査 | 医療データ漏洩・認証欠如チェック |
| `/simplify` | コード品質向上 | タイミングマップ駆動への統一 |
| `/loop` | 繰り返し実行 | `/loop 10m /verify` で定期動作確認 |
| `/schedule` | cron 実行 | 未記録チェックバッチ・月次PDF生成 |
| `/review` | PR レビュー | マージ前の Alexa リマインダー PR 確認 |
| `/fewer-permission-prompts` | 権限プロンプト削減 | npm・git コマンドの自動許可設定 |

---

## スキル詳細

### `/init`
**目的**: 新しいエージェントが初めてリポジトリに入ったとき、`CLAUDE.md` を自動生成してコードベースのコンテキストを整備する。

**このプロジェクトでのポイント**:
- 必ず `drug-and-oath/` から実行する（ワークスペース親ではない）
- `web/` と `alexa/` の二層構造を記述させる
- DynamoDB の PK/SK フォーマット（`USER#${USER_ID}` / `RECORD#DATE#uuid`）を含める
- 環境変数（`AWS_REGION`, `DYNAMODB_TABLE_NAME`, `USER_ID`）を明記する

---

### `/run`
**目的**: アプリを実際に起動してブラウザで動作確認する。

**起動コマンド**:
```bash
# Web
cd drug-and-oath/web && npm run dev   # http://localhost:3000

# Alexa（ビルドのみ。テストは Alexa シミュレーターで実施）
cd drug-and-oath/alexa && npm run zip
```

**確認すべきゴールデンパス**:
1. `/` → 今日の5タイミングが表示される
2. タイミングボタンタップ → 即記録・ボタン状態変化
3. `/monthly` → カレンダーが正しい月で表示される
4. 月次PDF ダウンロード → 日本語フォントで出力される
5. Alexa シミュレーターで「朝の薬を飲んだ」→ DynamoDB に記録される

---

### `/verify`
**目的**: コード変更が意図通りに動いているかを実際の動作で検証する。

**このプロジェクトでの検証チェックリスト**:
- [ ] `POST /api/records` → DynamoDB 書き込み → `GET /api/records?date=...` で取得できる
- [ ] Alexa `RecordMorningIntent` → `dynamodb.mjs` の `recordMedication` が呼ばれる
- [ ] `SetRemindersIntent` → 権限なし時は AskForPermissionsConsent カードが返る
- [ ] PDF 生成 → `NotoSansJP-Regular.ttf` で日本語が文字化けしない
- [ ] 月次画面 → 前月/次月ナビゲーションが日付境界（月末）で正しく動く

---

### `/code-review`
**目的**: 変更差分の正確性バグ・再利用性・効率性をレビューする。

**使い分け**:
- `/code-review` — 通常のPRレビュー（中程度の精度）
- `/code-review ultra` — マージ前の重要変更（深いレビュー）

**このプロジェクトで特に注意すべき点**:
- Alexa `index.mjs` と `dynamodb.mjs` の DynamoDB ロジックが再び重複していないか確認
- API ルートの未処理エラー（`try/catch` なし）を検出
- DynamoDB PK/SK フォーマットが `web/src/lib/dynamodb.ts` と `alexa/dynamodb.mjs` で一致しているか
- `web/src/app/api/records/route.ts` の日付範囲クエリが正しい GSI を使っているか

---

### `/security-review`
**目的**: 医療・健康データを扱うため、セキュリティ脆弱性を検査する。

**このプロジェクトの主なリスク領域**:
1. **認証欠如**: 現在 `USER_ID` が固定 `default-user`。マルチユーザー化前に必ず対処
2. **AWS 認証情報漏洩**: `web/.env.local` を `.gitignore` で確実に除外する
3. **入力バリデーション**: `POST /api/records` のタイミング値が列挙型以外を受け付けないこと
4. **削除操作**: `DELETE /api/records/[id]` が正しいユーザーの記録のみ削除することを確認
5. **Alexa アクセストークン**: `apiAccessToken` をログに出力していないこと

---

### `/simplify`
**目的**: 動くコードをシンプル・効率的に整理する（バグ修正ではなく品質向上）。

**このプロジェクトでの適用箇所**:
- `alexa/index.mjs` の5つの `Record*Intent` ハンドラを `INTENT_TO_TIMING` マップで統一（完了済み）
- `web/src/components/MainScreen.tsx` と `RecentList.tsx` の日付フォーマット処理を `lib/` に共通化
- `TIMING_DEFAULTS`（`web/src/lib/constants.ts`）を Alexa 側でも参照できる共有定数にする

---

### `/loop`
**目的**: 繰り返し発生するタスクを定期実行する。

**このプロジェクトでの使い方**:
```
/loop 10m /verify
```
開発中に10分ごとに自動で動作確認を実行。

```
/loop 60m /code-review
```
長時間の実装セッション中に差分をこまめにレビュー。

---

### `/schedule`
**目的**: クラウドエージェントを cron スケジュールで定期実行する。

**このプロジェクトで設定すべきルーティン候補**:
| スケジュール | 内容 |
|-------------|------|
| 毎朝 9:00 JST | 前日の未記録タイミングをチェックして通知 |
| 毎月1日 0:05 JST | 前月の月次 PDF を自動生成・S3 保存 |
| 週1回 日曜 | Alexa Reminders の設定状態を確認 |
| PR 作成時 | CI が通っているか確認して Slack に通知 |

---

### `/review`（PR レビュー）
**目的**: GitHub Pull Request を包括的にレビューする。

**このプロジェクトでのルール**:
- main への直接プッシュは禁止（branch protection を設定する）
- すべての機能追加は PR を経由し、`/review` でチェックしてからマージ
- Alexa Lambda の変更は必ず Alexa シミュレーターでの動作確認後にマージ

---

### `/fewer-permission-prompts`
**目的**: 頻繁に使うコマンドの権限プロンプトを削減してスムーズに開発。

**このプロジェクトで自動許可すべきコマンド**:
```
npm run dev
npm run build
npm run lint
npm run zip
node --check index.mjs
git status
git diff
git log
```

---

## エージェントセッション開始チェックリスト

新しい Fable セッションを開始するときは必ず以下を実行:

```bash
# 1. 正しいディレクトリに移動
cd drug-and-oath

# 2. 最新状態を確認
git status --short
git log --oneline -5

# 3. このファイルと PROJECT_HANDOFF.md を読む
# docs/FABLE_SKILLS.md（このファイル）
# docs/PROJECT_HANDOFF.md

# 4. 未コミット差分があれば確認してから作業開始
git diff
```

---

## CI/CD 状況（2026-07-08 時点）

| 項目 | 状態 | 備考 |
|------|------|------|
| GitHub Actions CI | ✅ 設定済み・コミット済み | `.github/workflows/ci.yml` |
| Web lint/build | ✅ CI で自動実行 | PR + main push で発火 |
| Alexa syntax check + zip | ✅ CI で自動実行 | `skill.zip` を artifact 保存 |
| main ブランチ保護 | ❌ 未設定 | GitHub 設定で手動設定が必要 |
| Web CD（自動デプロイ） | ❌ 未設定 | Vercel 連携が必要 |
| Alexa CD（Lambda 自動更新） | ❌ 未設定 | AWS IAM + GitHub Secrets が必要 |

**CI を有効化するには**: `git push origin main` でこのブランチを GitHub にプッシュすれば、次の PR から自動実行される。
