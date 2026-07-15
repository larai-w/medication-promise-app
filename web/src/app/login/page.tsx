'use client'

import { useState, type FormEvent } from 'react'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const formData = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/access/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: formData.get('accessCode') }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'ログインできませんでした')
      window.location.assign('/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ログインできませんでした')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <p className="text-indigo-600 text-sm font-semibold mb-2">限定テスト版</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">おくすりの約束</h1>
        <p className="text-gray-600 text-sm leading-6 mb-6">
          現在は招待されたご家族だけが利用できます。お渡ししたアクセスコードを入力してください。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accessCode" className="block text-sm font-medium text-gray-700 mb-2">
              アクセスコード
            </label>
            <input
              id="accessCode"
              name="accessCode"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-700 text-white py-3 font-medium hover:bg-indigo-800 disabled:opacity-60"
          >
            {submitting ? '確認中…' : '記録を見る'}
          </button>
        </form>

        <div className="mt-6 flex gap-4 text-xs text-gray-500">
          <a href="/privacy" className="underline">プライバシー</a>
          <a href="/terms" className="underline">利用条件</a>
        </div>
      </div>
    </main>
  )
}
