// セッション署名鍵の解決。
//
// 本番では鍵の実体を Lambda 環境変数に置かない。環境変数には ARN だけを入れ、
// 実体は Secrets Manager から実行時に取得する。環境変数は
// lambda:GetFunctionConfiguration だけで読めてしまうため。
//
// ローカル開発とテストでは MVP_SESSION_SECRET を直接読む。AWS に到達できない
// 環境で動かせなくなるのを避けるため。
//
// 取得はプロセス内で一度だけ行い、以降は使い回す。Lambda の実行環境は
// リクエスト間で再利用されるので、毎回取りに行くと余計な遅延と料金が出る。

type SecretEnvironment = Record<string, string | undefined>

const MINIMUM_LENGTH = 32

let cachedSecret: string | null = null
let inFlight: Promise<string> | null = null

/** テスト用。プロセス内キャッシュを捨てる。 */
export function resetSessionSecretCache() {
  cachedSecret = null
  inFlight = null
}

function validate(secret: string, source: string) {
  if (secret.length < MINIMUM_LENGTH) {
    throw new Error(`Session secret from ${source} must be at least ${MINIMUM_LENGTH} characters`)
  }
  return secret
}

async function fetchFromSecretsManager(secretId: string) {
  // 静的 import にすると、SDK がミドルウェアのバンドルに常に載る。
  // ローカルやテストでは不要なので、必要になった時だけ読み込む。
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    '@aws-sdk/client-secrets-manager'
  )
  const client = new SecretsManagerClient({})
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }))

  const value = result.SecretString
  if (!value) {
    throw new Error('Secrets Manager returned no SecretString for the session secret')
  }

  // JSON 形式で保存されている場合に備える（{"MVP_SESSION_SECRET":"..."} など）。
  // 平文で入っていればそのまま使う。
  if (value.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      const candidate = parsed.MVP_SESSION_SECRET ?? parsed.value ?? parsed.secret
      if (typeof candidate === 'string') return candidate
    } catch {
      // JSON として壊れているなら平文として扱う
    }
  }
  return value
}

/**
 * セッション署名鍵を返す。
 *
 * 優先順位:
 *   1. MVP_SESSION_SECRET（ローカル・テスト・移行期間）
 *   2. MVP_SESSION_SECRET_ARN 経由の Secrets Manager（本番）
 *
 * どちらも無ければ例外。呼び出し側は握りつぶさないこと。鍵が無いまま
 * 動くと、セッションを検証できないのに通してしまう危険がある。
 */
export async function resolveSessionSecret(
  env: SecretEnvironment = process.env
): Promise<string> {
  const direct = env.MVP_SESSION_SECRET
  if (direct) return validate(direct, 'MVP_SESSION_SECRET')

  if (cachedSecret) return cachedSecret

  const secretId = env.MVP_SESSION_SECRET_ARN
  if (!secretId) {
    throw new Error('Either MVP_SESSION_SECRET or MVP_SESSION_SECRET_ARN must be set')
  }

  // 同時に複数のリクエストが来ても Secrets Manager を1回しか叩かない。
  inFlight ??= fetchFromSecretsManager(secretId)
    .then((value) => {
      const checked = validate(value, 'Secrets Manager')
      cachedSecret = checked
      return checked
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/**
 * 設定が揃っているかだけを同期的に判定する。値そのものは見ない。
 * 起動時の構成チェックに使う。
 */
export function getSessionSecretConfigurationError(
  env: SecretEnvironment = process.env
): string | null {
  const direct = env.MVP_SESSION_SECRET
  if (direct) {
    return direct.length < MINIMUM_LENGTH
      ? `MVP_SESSION_SECRET must be at least ${MINIMUM_LENGTH} characters`
      : null
  }
  if (env.MVP_SESSION_SECRET_ARN) return null
  return 'Either MVP_SESSION_SECRET or MVP_SESSION_SECRET_ARN must be set'
}
