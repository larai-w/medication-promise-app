import AccessCodeLoginForm from '@/components/AccessCodeLoginForm'
import { getWebAuthMode } from '@/lib/auth-mode'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; error?: string }>
}) {
  const mode = getWebAuthMode()
  const { deleted, error } = await searchParams

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <p className="text-indigo-600 text-sm font-semibold mb-2">限定テスト版</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">おくすりの約束</h1>
        <p className="text-gray-600 text-sm leading-6 mb-6">
          現在は招待されたご家族だけが利用できます。
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            ログインを完了できませんでした。もう一度お試しください。
          </p>
        )}

        {deleted === '1' && (
          <p role="status" className="mb-4 text-sm text-green-700">
            世帯データの削除が完了しました。
          </p>
        )}

        {mode === 'cognito' ? (
          <a
            href="/api/auth/login"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 py-3 font-medium text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            招待アカウントでログイン
          </a>
        ) : (
          <AccessCodeLoginForm />
        )}

        <div className="mt-6 flex gap-4 text-xs text-gray-500">
          <a href="/privacy" className="underline">プライバシー</a>
          <a href="/terms" className="underline">利用条件</a>
        </div>
      </div>
    </main>
  )
}
