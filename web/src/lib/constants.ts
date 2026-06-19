export const TIMING_DEFAULTS = {
  '朝': '08:00',
  '昼': '12:00',
  '晩': '18:00',
  '夜8時': '20:00',
  '夜9時': '21:00',
} as const

export type Timing = keyof typeof TIMING_DEFAULTS
export const TIMINGS = Object.keys(TIMING_DEFAULTS) as Timing[]
