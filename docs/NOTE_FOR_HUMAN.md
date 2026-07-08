# 手動対応メモ — Drug and Oath

最終更新: 2026-07-08

Fableが自動実行できないこと（外部サービスへのアクセスが必要な操作）をまとめています。
手が空いたときに順番に対応してください。

---

## 今すぐやること（P0）

### 1. GitHubに main をプッシュ → CIを有効化

```bash
cd drug-and-oath
git push origin main
```

これをするだけで GitHub Actions CI が次のPRから自動実行されます。
現在3コミット分のCI設定・ドキュメント・Alexaリマインダーが未プッシュです。

---

### 2. Alexaリマインダー権限をオンにする

**場所**: [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → スキル「お薬の約束」→ ビルド → アクセス権限

**やること**:
- 「リマインダー」のトグルをオンにする

これをしないと `SetRemindersIntent` が常に権限エラーになります。

---

### 3. Alexaインタラクションモデルをデプロイ

`alexa/interaction-model.json` に `SetRemindersIntent` が追加されています。
Alexaコンソールにアップロードして「モデルをビルド」が必要です。

**方法A（コンソール）**:
1. Alexa Developer Console → 「お薬の約束」→ JSONエディタ
2. `drug-and-oath/alexa/interaction-model.json` の内容をコピペ
3. 「モデルを保存」→「モデルをビルド」をクリック

**方法B（ASK CLI）**:
```bash
cd drug-and-oath/alexa
ask deploy --target interaction-model
```
※ ASK CLIが `ask configure` で設定済みの場合のみ使えます

---

### 4. Alexa Lambda（skill.zip）をデプロイ

`recordMedication` の重複ロジック削除が含まれています。必ずデプロイしてください。

```bash
cd drug-and-oath/alexa
npm run zip
# → skill.zip が生成される
```

その後:
- AWS Lambda コンソール → 対象の関数 → 「コードをアップロード」→ .zip ファイル
- または ASK CLI: `ask deploy --target lambda`

---

## 余裕があるときにやること（P1）

### 5. GitHubのブランチ保護設定

**場所**: GitHub → `larai-w/medication-promise-app` → Settings → Branches → Add rule

**設定内容**:
- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - チェック: `Web lint and build` と `Alexa package check`
- ✅ Block direct pushes

---

### 6. GitHub Secrets に AWS 認証情報を設定（CD自動化のため）

Lambda の自動デプロイを GitHub Actions で行う場合に必要です。
（すぐは不要。T16 の CD 実装時にFableが指示します）

**場所**: GitHub → Settings → Secrets and variables → Actions → New repository secret

必要なシークレット:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`（`ap-northeast-1`）
- `LAMBDA_FUNCTION_NAME`（Lambda関数名）

---

### 7. Vercel に Web をデプロイ（本番公開）

1. [vercel.com](https://vercel.com) → 「New Project」→ GitHub リポジトリ `larai-w/medication-promise-app` を選択
2. Root Directory: `web`
3. 環境変数を設定:
   - `AWS_REGION`: `ap-northeast-1`
   - `DYNAMODB_TABLE_NAME`: `DrugAndOathRecords`
   - `USER_ID`: `default-user`
   - `AWS_ACCESS_KEY_ID`: （Lambda実行用のIAMキー）
   - `AWS_SECRET_ACCESS_KEY`: （同上）

---

## 確認チェックリスト

デプロイ後に動作確認する項目:

- [ ] Web: 今日の服薬画面が開く
- [ ] Web: ワンタップで記録できる
- [ ] Web: 月次PDFがダウンロードできる（日本語文字化けなし）
- [ ] Alexa: 「アレクサ、お薬の約束を開いて」でスキルが起動する
- [ ] Alexa: 「朝の薬を飲んだ」で DynamoDB に記録される
- [ ] Alexa: 「リマインダーを設定して」で5つのリマインダーが設定される
- [ ] Alexa: リマインダー権限なしのとき Alexa アプリにカードが届く

---

## 参考リンク

- Alexa Developer Console: https://developer.amazon.com/alexa/console/ask
- AWS Lambda コンソール: https://ap-northeast-1.console.aws.amazon.com/lambda
- DynamoDB コンソール: https://ap-northeast-1.console.aws.amazon.com/dynamodbv2
- GitHub リポジトリ: https://github.com/larai-w/medication-promise-app
- Vercel ダッシュボード: https://vercel.com/dashboard
