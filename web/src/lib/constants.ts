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
