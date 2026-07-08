# 手動対応メモ — Drug and Oath

最終更新: 2026-07-08（AWS Amplify版に更新）

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
現在4コミット分のCI設定・ドキュメント・UX修正が未プッシュです。

---

### 2. Alexaリマインダー権限をオンにする

**場所**: Alexa Developer Console → スキル「お薬の約束」→ ビルド → アクセス権限

**やること**:
- 「リマインダー」のトグルをオンにする

これをしないと `SetRemindersIntent` が常に権限エラーになります。

---

### 3. Alexaインタラクションモデルをデプロイ

`alexa/interaction-model.json` に `SetRemindersIntent` が追加されています。

**方法A（コンソール）**:
1. Alexa Developer Console → 「お薬の約束」→ JSONエディタ
2. `drug-and-oath/alexa/interaction-model.json` の内容をコピペ
3. 「モデルを保存」→「モデルをビルド」

**方法B（ASK CLI）**:
```bash
cd drug-and-oath/alexa
ask deploy --target interaction-model
```

---

### 4. Alexa Lambda（skill.zip）をデプロイ

```bash
cd drug-and-oath/alexa
npm run zip
```

その後、AWS Lambda コンソール → 対象の関数 → 「コードをアップロード」→ .zip ファイルを選択

---

## AWS Amplify で Web をデプロイする（P0）

### なぜ Amplify か

- DynamoDB・Lambda と同じ AWS アカウントで完結する
- IAM ロールで DynamoDB にアクセスできるので **アクセスキーを環境変数に書かなくていい**（Vercel より安全）
- Next.js SSR を標準サポート、CloudFront CDN が自動で付いてくる
- 無料枠（ビルド 1000分/月、転送 15GB/月）で 30 人規模まで実質 $0

### 手順（約15分）

**Step 1: Amplify コンソールを開く**
- AWS マネジメントコンソール → サービス検索で「Amplify」→「新しいアプリを作成」

**Step 2: GitHub リポジトリを接続**
- 「GitHub」を選択 → GitHub にサインイン
- リポジトリ: `larai-w/medication-promise-app`
- ブランチ: `main`

**Step 3: ビルド設定**

Amplify が自動検出しますが、`amplify.yml` が正しく設定されない場合は以下を手動入力:

```yaml
version: 1
applications:
  - frontend:
      phases:
        preBuild:
          commands:
            - cd web
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: web/.next
        files:
          - '**/*'
      cache:
        paths:
          - web/node_modules/**/*
    appRoot: web
```

**Step 4: 環境変数を設定**

Amplify コンソール → アプリ → 環境変数 → 追加:

| キー | 値 |
|------|-----|
| `AWS_REGION` | `ap-northeast-1` |
| `DYNAMODB_TABLE_NAME` | `DrugAndOathRecords` |
| `USER_ID` | `default-user` |

> **重要**: AWS_ACCESS_KEY_ID と AWS_SECRET_ACCESS_KEY は **不要**。
> 次の Step 5 で IAM ロールを使うので、アクセスキーは設定しない。

**Step 5: Amplify の IAM サービスロールに DynamoDB 権限を付与**

1. Amplify コンソール → アプリ → 全般設定 → サービスロール
2. 「サービスロールを作成」をクリック（`AmplifyConsoleServiceRole` が自動作成される）
3. IAM コンソール → ロール → `AmplifyConsoleServiceRole` を開く
4. 「許可を追加」→「ポリシーをアタッチ」→ `AmazonDynamoDBFullAccess` を選択してアタッチ

> 本番環境では `AmazonDynamoDBFullAccess` の代わりに以下の最小権限ポリシーを推奨:
> ```json
> {
>   "Version": "2012-10-17",
>   "Statement": [{
>     "Effect": "Allow",
>     "Action": ["dynamodb:PutItem","dynamodb:GetItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query"],
>     "Resource": "arn:aws:dynamodb:ap-northeast-1:*:table/DrugAndOathRecords"
>   }]
> }
> ```

**Step 6: デプロイを開始**
- 「保存してデプロイ」をクリック
- 初回ビルドに 3〜5 分かかります
- 完了すると `https://main.xxxxxxxxxx.amplifyapp.com` のような URL が発行されます

**Step 7: カスタムドメインを設定（任意）**

Amplify コンソール → ドメイン管理 → カスタムドメインを追加
- Route 53 でドメインを取得している場合: 自動で SSL 証明書が発行される
- 外部レジストラの場合: CNAME レコードを手動で設定

---

## 余裕があるときにやること（P1）

### 5. GitHub ブランチ保護設定

**場所**: GitHub → `larai-w/medication-promise-app` → Settings → Branches → Add rule

```
Branch name pattern: main
✅ Require a pull request before merging
✅ Require status checks to pass before merging
   → "Web lint and build" と "Alexa package check"
✅ Block direct pushes
```

---

### 6. GitHub Secrets に AWS 認証情報を設定（Lambda CD 自動化のため）

Lambda の自動デプロイを GitHub Actions で行う場合に必要です。

**場所**: GitHub → Settings → Secrets and variables → Actions → New repository secret

| シークレット名 | 値 |
|--------------|-----|
| `AWS_ACCESS_KEY_ID` | Lambda デプロイ用 IAM ユーザーのアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | 同上のシークレットキー |
| `AWS_REGION` | `ap-northeast-1` |
| `LAMBDA_FUNCTION_NAME` | Lambda 関数名（例: `drug-and-oath-alexa`） |

> **注**: IAM ユーザーには `lambda:UpdateFunctionCode` だけを許可した最小権限ポリシーを付ける

---

### 7. Route 53 でカスタムドメインを取得（任意）

例: `kusurinochikai.com` や `medication-promise.jp` など

1. Route 53 → ドメインの登録 → 希望のドメインを検索
2. 年額 ¥1,500〜¥2,000 程度
3. Amplify のドメイン管理と自動連携できる

---

## インフラ全体像（AWS のみで完結）

```
ユーザー
  ↓ HTTPS
CloudFront（Amplify に内蔵）
  ↓
Amplify（Next.js SSR）
  ├── /api/* → Next.js API Routes
  │     ↓ IAM ロール
  │   DynamoDB（DrugAndOathRecords テーブル）
  │
  └── /monthly/pdf → PDF 生成

Alexa スキル
  ↓
Lambda（alexa/index.mjs）
  ↓ IAM ロール
DynamoDB（同じテーブル）
```

---

## 確認チェックリスト（Amplify デプロイ後）

- [ ] Amplify URL が開き、今日の服薬画面が表示される
- [ ] ワンタップで服薬記録が追加される
- [ ] DynamoDB コンソールで実際にアイテムが作成されている
- [ ] 月次PDFがダウンロードできる（日本語文字化けなし）
- [ ] Alexa: 「アレクサ、お薬の約束を開いて」でスキルが起動する
- [ ] Alexa: 「朝の薬を飲んだ」→ DynamoDB に記録される
- [ ] Alexa: 「リマインダーを設定して」→ 5つのリマインダーが設定される

---

## 参考リンク

- AWS Amplify コンソール: https://ap-northeast-1.console.aws.amazon.com/amplify
- AWS Lambda コンソール: https://ap-northeast-1.console.aws.amazon.com/lambda
- DynamoDB コンソール: https://ap-northeast-1.console.aws.amazon.com/dynamodbv2
- IAM コンソール: https://console.aws.amazon.com/iam
- Alexa Developer Console: https://developer.amazon.com/alexa/console/ask
- GitHub リポジトリ: https://github.com/larai-w/medication-promise-app
