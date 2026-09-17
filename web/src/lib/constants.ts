export const DEFAULT_REMINDER_SCHEDULE = [
  { timing: '朝', time: '08:00' },
  { timing: '昼', time: '12:00' },
  { timing: '晩', time: '18:00' },
  { timing: '夜8時', time: '20:00' },
  { timing: '夜9時', time: '21:00' },
] as const

export const TIMING_DEFAULTS = Object.fromEntries(
  DEFAULT_REMINDER_SCHEDULE.map(({ timing, time }) => [timing, time])
) as Record<Timing, string>

export type Timing = (typeof DEFAULT_REMINDER_SCHEDULE)[number]['timing']
export const TIMINGS = Object.keys(TIMING_DEFAULTS) as Timing[]

/**
 * 画面と読み上げに出す名前。**保存する値ではない。**
 *
 * `timing` は記録そのものに保存され、書き出しスキーマ（v1/v2）の `enum` にも入っている。
 * ここを変えると過去の記録と比べられなくなり、care-event の契約も壊れる。
 * **だから保存値は `晩` のままにして、人が読む文字だけを変える。**
 *
 * 2026-09-16 オーナー依頼: 「晩」ではなく「夕方」と言ってほしい。
 * Alexa 側にも同じ対応表がある（`alexa/config.mjs`。zip の都合で import を共有できない）。
 * **ずれると画面と音声で呼び名が食い違う**ので、`web/test/timing-label.test.mts` で縛っている。
 */
export const TIMING_LABELS: Record<Timing, string> = {
  '朝': '朝',
  '昼': '昼',
  '晩': '夕方',
  '夜8時': '夜8時',
  '夜9時': '夜9時',
}

// 保存済みの記録には、いまの一覧に無い timing が残っていることがある。
// **知らない値は、そのまま出す**（勝手に置き換えない・空にしない）。
export function timingLabel(timing: Timing | string): string {
  return TIMING_LABELS[timing as Timing] ?? timing
}
