import { TIMINGS, type Timing } from './constants'

export interface Badge {
  id: string
  emoji: string
  label: string
  description: string
  earned: boolean
}

interface BadgeInput {
  streak: number
  maxStreak?: number       // 取得範囲内の最長連続日数。達成バッジは剥奪しないためこれで判定
  timingStats: { timing: Timing; total: number; completed: number; rate: number }[]
  monthlyRate: number
  perfectDays: number      // その日に全タイミング服薬した日数
  consecutivePerfectDays?: number  // 連続perfect日数（将来的に）
}

const BADGE_DEFINITIONS: Omit<Badge, 'earned'>[] = [
  { id: 'streak-7', emoji: '🔥', label: '7日連続', description: '7日連続で服薬を記録' },
  { id: 'streak-30', emoji: '💎', label: '30日連続', description: '30日連続で服薬を記録' },
  { id: 'monthly-perfect', emoji: '🌟', label: '月間パーフェクト', description: '今月毎日服薬を記録' },
  { id: 'morning-master', emoji: '☀️', label: '朝の達人', description: '朝の服薬率90%以上' },
  { id: 'evening-master', emoji: '🌙', label: '夜の達人', description: '夜9時の服薬率90%以上' },
  { id: 'complete-master', emoji: '🏅', label: 'コンプリートマスター', description: '1日5回全て服薬した日が10日以上' },
  { id: 'first-record', emoji: '🎉', label: '初記録', description: '初めて服薬を記録' },
  { id: 'midnight-oil', emoji: '🦉', label: '夜更かし薬', description: '夜8時と夜9時の両方を5日以上記録' },
]

export function computeBadges(input: BadgeInput): Badge[] {
  const earnedFlags: Record<string, boolean> = {
    // 一度でも達成したら剥奪しない: 現在の連続ではなく最長連続で判定（未指定時は現在値）
    'streak-7': (input.maxStreak ?? input.streak) >= 7,
    'streak-30': (input.maxStreak ?? input.streak) >= 30,
    'monthly-perfect': input.monthlyRate >= 100,
    'morning-master': (input.timingStats.find(s => s.timing === '朝')?.rate ?? 0) >= 90,
    'evening-master': (input.timingStats.find(s => s.timing === '夜9時')?.rate ?? 0) >= 90,
    'complete-master': input.perfectDays >= 10,
    'first-record': input.streak > 0 || input.perfectDays > 0,
    'midnight-oil': (input.timingStats.find(s => s.timing === '夜8時')?.rate ?? 0) >= 50 && (input.timingStats.find(s => s.timing === '夜9時')?.rate ?? 0) >= 50,
  }

  return BADGE_DEFINITIONS.map(def => ({
    ...def,
    earned: earnedFlags[def.id] ?? false,
  }))
}

export function countPerfectDays(
  records: { date: string; timing: Timing }[],
  allTimings: readonly Timing[] = TIMINGS
): number {
  const byDate = records.reduce<Record<string, Set<Timing>>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = new Set()
    acc[r.date].add(r.timing)
    return acc
  }, {})

  return Object.values(byDate).filter(timings => timings.size === allTimings.length).length
}