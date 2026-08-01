'use client'

import { useState, type FormEvent } from 'react'

export default function AccessCodeLoginForm() {
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
  )
}
