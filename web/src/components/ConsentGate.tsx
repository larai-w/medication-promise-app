'use client'

// 初回の同意画面。
//
// **これは手段を置き換える変更**なので、失敗したときに記録が止まらないことを
// 最優先にしている（CLAUDE.md §2.6）。判断そのものは
// `lib/consent/consent-gate.ts` の純粋関数にあり、テストで固定してある。
//
// - 状態が取れない / 読めない → **通す。** 控えめな注意だけ出す
// - 同意していない → 同意画面を出す
// - 研究提供（任意）は基本利用と**別に取る**。束ねると任意性が崩れる

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  CONSENT_UNVERIFIED_NOTICE,
  decideAppGate,
  type ConsentGateDecision,
} from '@/lib/consent/consent-gate'
import type { ConsentEvaluation, ConsentType } from '@/lib/consent/consent-record'
import { BASIC_CONSENT_SECTIONS } from '@/lib/consent/consent-text'

type ConsentState = Record<ConsentType, ConsentEvaluation>

/**
 * 同意なしで見られる画面。**ここに無い画面はすべてゲートされる。**
 *
 * 画面ごとにゲートを付ける形にすると、新しい画面を足したときに必ず忘れる。
 * 2026-08-24: `/` にしか付いておらず、`/monthly` と `/settings` が
 * 素通りだった（記録の中身が同意なしで見られる状態）。
 *
 * - `/login`   … 同意以前にログインが要る
 * - `/privacy` … **同意する前に読めなければ意味がない**
 * - `/terms`   … 同上
 */
const UNGATED_PATHS = ['/login', '/privacy', '/terms']

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ungated = UNGATED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const [decision, setDecision] = useState<ConsentGateDecision | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ungated) return
    let cancelled = false

    async function resolveDecision(): Promise<ConsentGateDecision> {
      try {
        const res = await fetch('/api/consent', { cache: 'no-store' })
        // 401/403 は同意以前の話（未ログイン等）。ここでは触らず通常の画面へ委ねる
        if (res.status === 401 || res.status === 403) return { kind: 'allow' }
        if (!res.ok) return decideAppGate(null)
        const data = (await res.json()) as { state: ConsentState }
        return decideAppGate(data.state)
      } catch {
        // 通信できないことを理由に記録を止めない
        return decideAppGate(null)
      }
    }

    resolveDecision().then((next) => {
      if (!cancelled) setDecision(next)
    })

    return () => {
      cancelled = true
    }
  }, [ungated])

  async function agree() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant', consentType: 'basic' }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        // **記録できていないのに「同意しました」と見せない。**
        setError(data.error ?? '記録できませんでした。時間をおいてお試しください')
        return
      }
      const data = (await res.json()) as { state: ConsentState }
      setDecision(decideAppGate(data.state))
    } catch {
      setError('記録できませんでした。通信の状態をご確認ください')
    } finally {
      setSubmitting(false)
    }
  }

  // 同意なしで見られる画面は素通しする（ポリシーは同意前に読めないと意味がない）
  if (ungated) return <>{children}</>

  // 判定前は何も差し込まない（画面のちらつきを避ける）
  if (decision === null) return <>{children}</>

  if (decision.kind === 'ask') {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <article className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <p className="text-sm text-indigo-600 font-semibold mb-2">おくすりの約束・限定テスト版</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">はじめる前に</h1>

          <div className="space-y-6 text-sm leading-7 text-gray-700">
            {BASIC_CONSENT_SECTIONS.map((section) => (
              <section key={section.requirement}>
                <h2 className="text-base font-semibold text-gray-900 mb-1">{section.heading}</h2>
                <p>{section.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-8 pt-5 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-4">
              くわしくは
              <Link href="/privacy" className="text-indigo-700 underline mx-1">
                プライバシーポリシー
              </Link>
              と
              <Link href="/terms" className="text-indigo-700 underline mx-1">
                利用条件
              </Link>
              をご覧ください。
            </p>

            {error && (
              <p
                role="alert"
                className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={agree}
              disabled={submitting}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-white font-semibold disabled:opacity-60"
            >
              {submitting ? '記録しています...' : '同意して始める'}
            </button>
          </div>
        </article>
      </main>
    )
  }

  return (
    <>
      {decision.kind === 'allow-unverified' && (
        <p
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2 text-center"
        >
          {CONSENT_UNVERIFIED_NOTICE}
        </p>
      )}
      {children}
    </>
  )
}
