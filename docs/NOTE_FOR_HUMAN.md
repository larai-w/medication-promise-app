# 手動対応メモ — Drug and Oath

最終更新: 2026-07-08

Fableが自動実行できないこと（外部サービスへのアクセスが必要な操作）をまとめています。
各作業の目安時間も記載しています。

---

## veai.jp と CloudFront の方針を先に決める

Drug and Oath のデプロイ先を選ぶ前に、以下を確認してください。

### veai.jp に接続するか？

| 方針 | URL例 | CloudFront追加 | 手順 |
|------|-------|--------------|------|
| **A: Amplify デフォルト URL をそのまま使う（推奨）** | `https://main.xxxxxx.amplifyapp.com` | なし（Amplify内部で管理） | 最もシンプル |
| B: veai.jp のサブドメインを使う | `https://kusuri.veai.jp` | 1枚増える | Amplifyのドメイン管理で追加 |
| C: 既存 CloudFront に behavior を追加 | `https://veai.jp/kusuri` | 増えない | 既存 distribution の設定変更が必要 |

**30人規模の間は方針Aで十分です。** ユーザーに URL を直接共有するだけなので、`amplifyapp.com` のドメインでも問題ありません。

---

### CloudFront が5枚あって「これ以上増やせない」問題

#### 原因の切り分け

まず何が起きているかを確認してください:

**ケース1: AWS アカウントのクォータ上限に当たっている**
- デフォルト上限は 25 枚。5枚で詰まるのは異常
- 確認: AWS Console → Service Quotas → CloudFront → `Distributions per AWS account`
- **対処**: 「クォータを引き上げる」ボタンを押すだけ（無料・即時〜数時間）

**ケース2: 同じドメイン名（veai.jp）を複数の distribution に設定しようとしてエラー**
- CloudFront は1つのドメイン名を1つの distribution にしか設定できない
- **対処**: 既存の distribution から veai.jp を外してから新しい distribution に設定する。または既存 distribution に behavior を追加する（→ ケース3）

**ケース3: 管理が煩雑になってきた（distribution が増えすぎ）**
- 5枚は技術的には問題なし。でも整理したい
- **対処**: 複数の小さいアプリを1枚の distribution に統合する（下記「distribution 統合の方法」参照）

#### distribution 統合の方法（ケース3向け）

veai.jp 上の複数アプリを1枚の distribution でまとめて配信できます:

```
CloudFront distribution（veai.jp）
  ├── /kusuri/*      → Drug and Oath（Amplify URL をオリジンに追加）
  ├── /api/app1/*   → App1 のオリジン
  ├── /api/app2/*   → App2 のオリジン
  └── /*            → デフォルトオリジン（既存サイト）
```

**手順（既存 distribution に Drug and Oath を追加）**:
1. CloudFront コンソール → 既存の veai.jp distribution を選択
2. 「オリジン」タブ → 「オリジンを作成」
   - オリジンドメイン: `main.xxxxxx.amplifyapp.com`（Amplify のデプロイ URL）
   - プロトコル: HTTPS のみ
3. 「ビヘイビア」タブ → 「ビヘイビアを作成」
   - パスパターン: `/kusuri*`
   - オリジン: 先ほど作成した Amplify オリジン
   - ビューワープロトコルポリシー: HTTPS のみ
4. 保存 → デプロイ完了まで 3〜5 分

> **注意**: Next.js は `/kusuri` のようなパスプレフィックスがある場合、`next.config.js` に `basePath: '/kusuri'` の設定が必要になります。Fable に「basePath を /kusuri に設定して」と頼めば対応できます。

---

## P0: 今すぐやること（合計 約45〜60分）

### 1. GitHub に main をプッシュ → CI を有効化
**⏱ 目安: 2分**

```bash
cd drug-and-oath
git push origin main
```

これをするだけで GitHub Actions CI が次のPRから自動実行されます。
現在5コミット分の変更が未プッシュです。

---

### 2. Alexa リマインダー権限をオンにする
**⏱ 目安: 3分**

**場所**: Alexa Developer Console → スキル「お薬の約束」→ ビルド → アクセス権限

- 「リマインダー」のトグルをオンにする

これをしないと `SetRemindersIntent` が常に権限エラーになります。

---

### 3. Alexa インタラクションモデルをデプロイ
**⏱ 目安: 10〜15分**（「モデルをビルド」の完了待ちを含む）

**方法A（コンソール）**:
1. Alexa Developer Console → 「お薬の約束」→ JSONエディタ
2. `drug-and-oath/alexa/interaction-model.json` の内容をコピペ
3. 「モデルを保存」→「モデルをビルド」（ビルドに5〜10分かかる）

**方法B（ASK CLI）**:
```bash
cd drug-and-oath/alexa
ask deploy --target interaction-model
```

---

### 4. Alexa Lambda（skill.zip）をデプロイ
**⏱ 目安: 10分**

```bash
cd drug-and-oath/alexa
npm run zip
```

その後:
- AWS Lambda コンソール → 対象の関数 → 「コードをアップロード」→ .zip ファイルを選択
- 「デプロイ」ボタンを押す

---

### 5. AWS Amplify で Web をデプロイする
**⏱ 目安: 20〜30分**（初回ビルド待ちを含む）

**Step 1: Amplify コンソールを開く（1分）**
- AWS マネジメントコンソール → サービス検索で「Amplify」→「新しいアプリを作成」

**Step 2: GitHub リポジトリを接続（3分）**
- 「GitHub」を選択 → GitHub にサインイン
- リポジトリ: `larai-w/medication-promise-app`
- ブランチ: `main`

**Step 3: ビルド設定（3分）**

Amplify が自動検出しますが、正しく設定されない場合は以下を手動入力:

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

**Step 4: 環境変数を設定（2分）**

Amplify コンソール → アプリ → 環境変数 → 追加:

| キー | 値 |
|------|-----|
| `AWS_REGION` | `ap-northeast-1` |
| `DYNAMODB_TABLE_NAME` | `DrugAndOathRecords` |
| `USER_ID` | `default-user` |

> `AWS_ACCESS_KEY_ID` と `AWS_SECRET_ACCESS_KEY` は **不要**。Step 5 の IAM ロールで代替します。

**Step 5: IAM サービスロールに DynamoDB 権限を付与（5分）**

1. Amplify コンソール → アプリ → 全般設定 → サービスロール
2. 「サービスロールを作成」→ `AmplifyConsoleServiceRole` が自動作成される
3. IAM コンソール → ロール → `AmplifyConsoleServiceRole` を開く
4. 「許可を追加」→「ポリシーをアタッチ」→ `AmazonDynamoDBFullAccess` をアタッチ

本番環境では最小権限ポリシーを推奨:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:PutItem","dynamodb:GetItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query"],
    "Resource": "arn:aws:dynamodb:ap-northeast-1:*:table/DrugAndOathRecords"
  }]
}
```

**Step 6: デプロイを開始（待ち時間: 5〜10分）**
- 「保存してデプロイ」をクリック
- 完了すると `https://main.xxxxxxxxxx.amplifyapp.com` のような URL が発行される

**Step 7: ドメインを接続（任意・5分）**

「方針A（amplifyapp.com のまま）」の場合はスキップ。

veai.jp のサブドメイン（例: `kusuri.veai.jp`）を使う場合:
- Amplify コンソール → ドメイン管理 → カスタムドメインを追加
- Route 53 管理なら自動で SSL 証明書が発行される
- ※ CloudFront の distribution が1枚増えます

既存 CloudFront distribution に統合する場合（ページ上部の「distribution 統合の方法」を参照）:
- Amplify URL をオリジンとして追加
- `/kusuri*` のビヘイビアを追加
- `next.config.js` への `basePath` 設定が必要（Fable に依頼）

---

## P1: 余裕があるときにやること（合計 約20〜30分）

### 6. GitHub ブランチ保護設定
**⏱ 目安: 5分**

GitHub → `larai-w/medication-promise-app` → Settings → Branches → Add rule:

```
Branch name pattern: main
✅ Require a pull request before merging
✅ Require status checks to pass before merging
   → "Web lint and build" と "Alexa package check"
✅ Block direct pushes
```

---

### 7. GitHub Secrets に AWS 認証情報を設定（Lambda CD 自動化のため）
**⏱ 目安: 10〜15分**（IAM ユーザー作成含む）

Lambda の自動デプロイを GitHub Actions で行う場合に必要です。

**7-1. IAM ユーザーを作成（5分）**
- IAM コンソール → ユーザー → ユーザーを作成
- 名前: `github-actions-drug-and-oath`
- アクセスキーを発行（「サードパーティサービス」を選択）
- ポリシー: `lambda:UpdateFunctionCode` のみ許可

**7-2. GitHub に登録（5分）**
GitHub → Settings → Secrets and variables → Actions:

| シークレット名 | 値 |
|--------------|-----|
| `AWS_ACCESS_KEY_ID` | 発行したアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | 発行したシークレットキー |
| `AWS_REGION` | `ap-northeast-1` |
| `LAMBDA_FUNCTION_NAME` | Lambda 関数名 |

---

## 時間まとめ

| フェーズ | 作業 | 目安時間 |
|---------|------|---------|
| P0 | 1. git push | 2分 |
| P0 | 2. Alexa リマインダー権限 | 3分 |
| P0 | 3. インタラクションモデル デプロイ | 10〜15分 |
| P0 | 4. Lambda デプロイ | 10分 |
| P0 | 5. Amplify デプロイ（初回） | 20〜30分 |
| **P0 合計** | | **約 45〜60分** |
| P1 | 6. ブランチ保護 | 5分 |
| P1 | 7. GitHub Secrets | 10〜15分 |
| **P0+P1 合計** | | **約 1〜1.5時間** |

---

## インフラ全体像

```
ユーザー
  ↓ HTTPS
[ 方針A ] amplifyapp.com ドメイン（CloudFront はAmplify内部）
[ 方針B ] kusuri.veai.jp → Amplify（CloudFront が1枚増える）
[ 方針C ] veai.jp/kusuri → 既存 CloudFront → Amplify をオリジンに追加
  ↓
Amplify（Next.js SSR）
  ├── /api/* → Next.js API Routes
  │     ↓ IAM ロール（アクセスキー不要）
  │   DynamoDB（DrugAndOathRecords）
  └── /monthly → PDF 生成

Alexa スキル → Lambda → DynamoDB（同じテーブル）
```

---

## デプロイ後の確認チェックリスト

- [ ] URL が開き、今日の服薬画面が表示される
- [ ] ワンタップで服薬記録が追加される
- [ ] DynamoDB コンソールでアイテムが作成されている
- [ ] 月次 PDF がダウンロードできる（日本語文字化けなし）
- [ ] Alexa: 「アレクサ、お薬の約束を開いて」で起動する
- [ ] Alexa: 「朝の薬を飲んだ」→ DynamoDB に記録される
- [ ] Alexa: 「リマインダーを設定して」→ 5つのリマインダーが設定される

---

## 参考リンク

- AWS Amplify コンソール: https://ap-northeast-1.console.aws.amazon.com/amplify
- AWS CloudFront コンソール: https://console.aws.amazon.com/cloudfront
- AWS Service Quotas（上限確認）: https://console.aws.amazon.com/servicequotas
- AWS Lambda コンソール: https://ap-northeast-1.console.aws.amazon.com/lambda
- DynamoDB コンソール: https://ap-northeast-1.console.aws.amazon.com/dynamodbv2
- IAM コンソール: https://console.aws.amazon.com/iam
- Alexa Developer Console: https://developer.amazon.com/alexa/console/ask
- GitHub リポジトリ: https://github.com/larai-w/medication-promise-app
