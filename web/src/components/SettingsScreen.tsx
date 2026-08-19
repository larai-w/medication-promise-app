'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DEFAULT_MEDICATION_SETTINGS, type MedicationSettings } from '@/lib/settings'
import { hasMetricsConsent, setMetricsConsent } from '@/lib/metrics/record-time-tracker'

interface DeletionInfo {
  available: boolean
  confirmation: string
  recovery: string
  externalData: string
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<MedicationSettings>(DEFAULT_MEDICATION_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metricsConsent, setMetricsConsentState] = useState(false)
  const [deletionInfo, setDeletionInfo] = useState<DeletionInfo | null>(null)
  const [deletionConfirmation, setDeletionConfirmation] = useState('')
  const [understandsRecovery, setUnderstandsRecovery] = useState(false)
  const [understandsExternalData, setUnderstandsExternalData] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const consentTimer = window.setTimeout(() => setMetricsConsentState(hasMetricsConsent()), 0)
    async function loadSettings() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/settings')
        if (response.status === 401) {
          window.location.assign('/login')
          return
        }
        if (!response.ok) throw new Error('設定を読み込めませんでした')
        setSettings(await response.json() as MedicationSettings)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '設定を読み込めませんでした')
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
    fetch('/api/account/data', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => setDeletionInfo(body as DeletionInfo | null))
      .catch(() => setDeletionInfo(null))

    return () => window.clearTimeout(consentTimer)
  }, [])

  const updateTime = (index: number, time: string) => {
    setSettings((current) => ({
      ...current,
      reminderSchedule: current.reminderSchedule.map((item, i) => (
        i === index ? { ...item, time } : item
      )),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (response.status === 401) {
        window.location.assign('/login')
        return
      }
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || '設定を保存できませんでした')
      setSettings(body as MedicationSettings)
      setMessage('設定を保存しました。Alexaで「リマインダーを設定して」と話すと、この時刻で作り直されます。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '設定を保存できませんでした')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccountData = async () => {
    if (!deletionInfo?.available || deleting) return
    setDeleting(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/account/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: deletionConfirmation,
          understandsRecovery,
          understandsExternalData,
        }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || '削除を完了できませんでした')
      window.location.assign('/login?deleted=1')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '削除を完了できませんでした')
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-700 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <h1 className="text-xl font-bold tracking-wide">設定</h1>
        <div className="flex items-center gap-2">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-white/20 px-3 text-sm transition-colors hover:bg-white/30">
            メイン画面
          </Link>
          <form action="/api/access/logout" method="post">
            <button type="submit" className="min-h-11 px-3 text-xs text-white/80 hover:text-white">終了</button>
          </form>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-16">
        <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm text-gray-500 leading-6 mb-5">
            家専用の薬名とリマインダー時刻を設定します。保存後、Alexaで「リマインダーを設定して」と話すと、Alexa側の毎日リマインダーがこの内容で作り直されます。
          </p>

          {loading ? (
            <p className="text-gray-600 text-sm">読み込み中...</p>
          ) : (
            <div className="space-y-5">
              <div>
                <label htmlFor="medicationName" className="block text-sm font-medium text-gray-700 mb-2">
                  薬名
                </label>
                <input
                  id="medicationName"
                  type="text"
                  value={settings.medicationName}
                  onChange={(event) => setSettings((current) => ({ ...current, medicationName: event.target.value }))}
                  placeholder="例: お薬A"
                  maxLength={80}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-2 text-xs text-gray-500">
                  空欄にするとAlexaは「お薬」とだけ呼びかけます。
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-800">リマインダー時刻</h2>
                {settings.reminderSchedule.map((item, index) => (
                  <label key={item.timing} className="flex items-center justify-between gap-4">
                    <span className="text-gray-700 font-medium">{item.timing}</span>
                    <input
                      type="time"
                      value={item.time}
                      onChange={(event) => updateTime(index, event.target.value)}
                      className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                ))}
              </div>

              <label className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-gray-200 pt-5">
                <input
                  type="checkbox"
                  checked={metricsConsent}
                  onChange={(event) => {
                    setMetricsConsent(event.target.checked)
                    setMetricsConsentState(event.target.checked)
                  }}
                  className="mt-1 size-5 accent-indigo-700"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">任意の利用統計を送信する</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500">
                    保存にかかった時間だけを送信します。薬名、記録内容、端末を追跡するIDは送信しません。
                  </span>
                </span>
              </label>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="min-h-11 w-full rounded-xl bg-indigo-700 py-3 font-medium text-white hover:bg-indigo-800 disabled:opacity-60"
              >
                {saving ? '保存中...' : '設定を保存'}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-gray-900">データの削除</h2>
          {!deletionInfo?.available ? (
            <div className="space-y-2 text-sm leading-6 text-gray-600">
              <p>世帯データの一括削除は現在利用できません。個別の記録は、各記録の詳細から削除できます。</p>
              <p>
                すべての記録の削除や限定テストへの参加終了は、
                <a className="underline" href="mailto:info@veai.jp">info@veai.jp</a>
                へご連絡ください。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-gray-700">
                この世帯の記録、薬名とリマインダー時刻の設定、アプリ内の連携情報を削除し、ログアウトします。削除したデータをアプリの画面から元に戻すことはできません。
              </p>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-gray-700">
                <input
                  type="checkbox"
                  checked={understandsRecovery}
                  onChange={(event) => setUnderstandsRecovery(event.target.checked)}
                  className="mt-1 size-5 shrink-0 accent-red-700"
                />
                <span>{deletionInfo.recovery}</span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-gray-700">
                <input
                  type="checkbox"
                  checked={understandsExternalData}
                  onChange={(event) => setUnderstandsExternalData(event.target.checked)}
                  className="mt-1 size-5 shrink-0 accent-red-700"
                />
                <span>{deletionInfo.externalData}</span>
              </label>
              <div>
                <label htmlFor="deletionConfirmation" className="mb-2 block text-sm font-medium text-gray-800">
                  確認のため「{deletionInfo.confirmation}」と入力してください
                </label>
                <input
                  id="deletionConfirmation"
                  type="text"
                  value={deletionConfirmation}
                  onChange={(event) => setDeletionConfirmation(event.target.value)}
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>
              <button
                type="button"
                onClick={handleDeleteAccountData}
                disabled={
                  deleting
                  || deletionConfirmation !== deletionInfo.confirmation
                  || !understandsRecovery
                  || !understandsExternalData
                }
                className="min-h-11 w-full rounded-xl bg-red-700 py-3 font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deleting ? '削除中...' : '世帯データを削除'}
              </button>
            </div>
          )}
        </section>

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
            {message}
          </div>
        )}
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </main>
    </div>
  )
}
