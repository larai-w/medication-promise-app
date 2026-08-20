// 「30分前に飲んだ」のような相対時刻を扱う。
//
// Alexa の AMAZON.DURATION スロットは ISO-8601 の期間を返す（PT30M, PT1H, PT1H30M）。
// 何も言われなければ従来どおり「話しかけた時刻」を記録する。

// 服薬記録として妥当な遡り幅の上限。
// これを超える値は聞き間違いの可能性が高いので受け付けない
// （「10分前」が「10時間前」に化けるような誤認識を、そのまま記録しない）。
export const MAX_MINUTES_AGO = 12 * 60

export class SpokenTimeError extends Error {}

/**
 * ISO-8601 の期間を分に変換する。日・時・分のみ対応。
 * 週や月（P1W / P1M）は服薬記録の文脈で意味を成さないので拒否する。
 */
export function durationToMinutes(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(iso)
  if (!m) throw new SpokenTimeError('unsupported duration')
  const [, d, h, min] = m
  if (!d && !h && !min) throw new SpokenTimeError('empty duration')
  return Number(d ?? 0) * 24 * 60 + Number(h ?? 0) * 60 + Number(min ?? 0)
}

/**
 * インテントのスロットから「何分前か」を取り出す。
 * 返り値が null なら「言われなかった」＝従来どおりの挙動。
 */
export function minutesAgoFromIntent(intent) {
  const raw = intent?.slots?.ago?.value
  const minutes = durationToMinutes(raw)
  if (minutes === null) return null
  if (minutes <= 0) throw new SpokenTimeError('duration must be positive')
  if (minutes > MAX_MINUTES_AGO) throw new SpokenTimeError('duration too large')
  return minutes
}

/** 読み上げ用に「8時5分」の形にする。0埋めしない（読み上げが不自然になるため）。 */
export function speakTime(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  return `${Number(m[1])}時${Number(m[2])}分`
}
