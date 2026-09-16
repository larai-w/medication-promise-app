export const DEFAULT_REMINDER_SCHEDULE = Object.freeze([
  { timing: '朝', hour: 8, min: 0 },
  { timing: '昼', hour: 12, min: 0 },
  { timing: '晩', hour: 18, min: 0 },
  { timing: '夜8時', hour: 20, min: 0 },
  { timing: '夜9時', hour: 21, min: 0 },
])

const SUPPORTED_TIMINGS = new Set(DEFAULT_REMINDER_SCHEDULE.map(({ timing }) => timing))

/**
 * 読み上げに使う名前。**保存する値ではない。**
 *
 * `timing` は記録そのものに保存され、書き出しスキーマ（v1/v2）の `enum` にも入っている。
 * ここを変えると過去の記録と比べられなくなるので、**保存値は `晩` のまま**にして、
 * 人が聞く言葉だけを変える。
 *
 * 2026-09-16 オーナー依頼: 「晩」ではなく「夕方」と言ってほしい。
 * Web 側にも同じ対応表がある（`web/src/lib/constants.ts`。zip で固める都合上
 * import を共有できないので複製している）。**ずれると画面と音声で呼び名が食い違う**ので、
 * `web/test/timing-label.test.mts` が両方を読み比べて縛っている。
 */
export const TIMING_LABELS = Object.freeze({
  '朝': '朝',
  '昼': '昼',
  '晩': '夕方',
  '夜8時': '夜8時',
  '夜9時': '夜9時',
})

// 知らない値はそのまま返す（勝手に置き換えない）。
export function timingLabel(timing) {
  return TIMING_LABELS[timing] ?? timing
}

function parseTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return undefined
  }
  const [hour, min] = value.split(':').map(Number)
  return { hour, min }
}

function validateSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0 || schedule.length > 10) {
    throw new Error('REMINDER_SCHEDULE_JSON must contain 1 to 10 reminders')
  }

  const seen = new Set()
  return schedule.map((item) => {
    const timing = typeof item?.timing === 'string' ? item.timing.trim() : ''
    const parsedTime = parseTime(item?.time)
    const hour = parsedTime?.hour ?? Number(item?.hour)
    const min = parsedTime?.min ?? Number(item?.min)

    if (!SUPPORTED_TIMINGS.has(timing)) {
      throw new Error(`Unsupported reminder timing: ${timing || '(empty)'}`)
    }
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error(`Invalid reminder hour for ${timing}`)
    }
    if (!Number.isInteger(min) || min < 0 || min > 59) {
      throw new Error(`Invalid reminder minute for ${timing}`)
    }
    if (seen.has(timing)) {
      throw new Error(`Duplicate reminder timing: ${timing}`)
    }
    seen.add(timing)
    return { timing, hour, min }
  })
}

export function getReminderSchedule(env = process.env, storedSchedule) {
  if (storedSchedule) return validateSchedule(storedSchedule)

  const raw = env.REMINDER_SCHEDULE_JSON
  if (!raw) return DEFAULT_REMINDER_SCHEDULE.map((item) => ({ ...item }))

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('REMINDER_SCHEDULE_JSON must be valid JSON')
  }
  return validateSchedule(parsed)
}

export function getMedicationName(env = process.env, settings = {}) {
  if (typeof settings.medicationName === 'string' && settings.medicationName.trim()) {
    return settings.medicationName.trim()
  }
  return env.MEDICATION_NAME ?? ''
}

export function buildReminderText(timing, medicationName = '') {
  const safeName = medicationName.trim().slice(0, 80)
  const subject = safeName ? `${safeName}の服薬予定` : 'お薬の服薬予定'
  const closing = timing === '夜9時' ? '今日も一日お疲れさまでした。' : ''
  return `${timingLabel(timing)}の${subject}時刻です。服薬の予定を確認してください。${closing}記録するときは「アレクサ、お薬の約束を開いて」と話しかけてください。`
}

export function formatReminderSummary(schedule) {
  return schedule
    .map(({ timing, hour, min }) => `${timingLabel(timing)}${hour}時${min === 0 ? '' : `${min}分`}`)
    .join('、')
}
