import Link from 'next/link'
import type { ReactNode } from 'react'

export default function LegalDocument({ title, updated, children }: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <article className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <p className="text-sm text-indigo-600 font-semibold mb-2">おくすりの約束・限定テスト版</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-xs text-gray-500 mb-8">最終更新: {updated}</p>
        <div className="space-y-7 text-sm leading-7 text-gray-700">{children}</div>
        <div className="mt-10 pt-5 border-t border-gray-200 flex flex-wrap gap-4 text-sm">
          <Link href="/login" className="text-indigo-700 underline">ログインへ戻る</Link>
          <Link href="/privacy" className="text-indigo-700 underline">プライバシー</Link>
          <Link href="/terms" className="text-indigo-700 underline">利用条件</Link>
        </div>
      </article>
    </main>
  )
}
