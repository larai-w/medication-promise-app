export type WebAuthMode = 'mvp' | 'cognito'

type AuthEnvironment = Record<string, string | undefined>

export function getWebAuthMode(env: AuthEnvironment = process.env): WebAuthMode {
  const value = env.WEB_AUTH_MODE || 'mvp'
  if (value === 'mvp' || value === 'cognito') return value
  throw new Error('WEB_AUTH_MODE must be "mvp" or "cognito"')
}
