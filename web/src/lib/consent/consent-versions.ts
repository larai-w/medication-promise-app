// 同意記録に残すバージョン。
//
// COMP-01 C-06 は「同意日時・**バージョン**の保存」を求めている。
// プライバシーポリシーに版が無いと、同意レコードの ppVersion が意味を持たない
// （「何に同意したのか」が後から特定できない）。ここを唯一の出所にする。

/**
 * プライバシーポリシーの版。**画面の「最終更新」と同じ日を指す。**
 * `src/app/privacy/page.tsx` はこの定数から表示する。ずれると
 * consent-versions.test.mts が落ちる。
 *
 * 文書を直したらここも上げること。上げ忘れると、古い説明に同意した人と
 * 新しい説明に同意した人が同じ ppVersion で記録される。
 */
export const PRIVACY_POLICY_VERSION = '2026-08-19'

/** 画面に出す表記。上の版と同じ日でなければならない。 */
export const PRIVACY_POLICY_UPDATED_LABEL = '2026年8月19日'

/**
 * 同意画面で見せた文言の版。プライバシーポリシーとは別に動く。
 * 文言を変えたら上げる。
 */
export const CONSENT_TEXT_VERSION = '2026-08-24'

/** `2026年8月19日` → `2026-08-19`。表記と版がずれていないかの検算用。 */
export function labelToIsoDate(label: string): string | null {
  const m = label.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}
