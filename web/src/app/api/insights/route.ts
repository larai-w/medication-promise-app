import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { listRecordsForHousehold } from '@/lib/household-records.ts'
import { TIMINGS, type Timing } from '@/lib/constants'
import { subDays, format } from 'date-fns'
import type { MedicationRecord } from '@/types'
import { computeBadges, countPerfectDays } from '@/lib/badges'

interface TimingStats {
  timing: Timing
  total: number        // 対象日数
  completed: number    // 服薬した日数
  rate: number         // パーセント
}

interface DailyBreakdown {
  [date: string]: Set<Timing>
}

function computeStreak(allRecords: MedicationRecord[]): number {
  if (allRecords.length === 0) return 0
  const uniqueDates = [...new Set(allRecords.map(r => r.date))].sort().reverse()
  let streak = 0
  const today = new Date()
  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = subDays(today, i)
    const dateStr = format(expected, 'yyyy-MM-dd')
    if (uniqueDates[i] === dateStr) {
      streak++
    } else {
      break
    }
  }
  return streak
}

function buildDailyBreakdown(records: MedicationRecord[]): DailyBreakdown {
  const breakdown: DailyBreakdown = {}
  for (const r of records) {
    if (!breakdown[r.date]) breakdown[r.date] = new Set()
    breakdown[r.date].add(r.timing)
  }
  return breakdown
}

function computeTimingStats(
  records: MedicationRecord[],
  totalDays: number
): TimingStats[] {
  const breakdown = buildDailyBreakdown(records)
  return TIMINGS.map(timing => {
    let completed = 0
    for (const timings of Object.values(breakdown)) {
      if (timings.has(timing)) completed++
    }
    return {
      timing,
      total: totalDays,
      completed,
      rate: totalDays > 0 ? Math.round((completed / totalDays) * 100) : 0,
    }
  })
}

function computeMonthlyRate(records: MedicationRecord[]): {
  completed: number
  total: number
  rate: number
} {
  const now = new Date()
  const monthStart = format(now, 'yyyy-MM-01')

  // 今日までの日数（未来の日付は含めない）
  const todayStr = format(now, 'yyyy-MM-dd')
  const monthRecords = records.filter(r => r.date >= monthStart && r.date <= todayStr)
  const uniqueDays = new Set(monthRecords.map(r => r.date)).size
  const todayDay = parseInt(todayStr.split('-')[2], 10)
  
  return {
    completed: uniqueDays,
    total: todayDay,
    rate: Math.round((uniqueDays / todayDay) * 100),
  }
}

function generateMessage(
  streak: number,
  timingStats: TimingStats[],
  todayCompleted: number
): { emoji: string; text: string; type: 'celebrate' | 'encourage' | 'warning' | 'nudge' } {
  if (streak >= 7) {
    return {
      emoji: '🏆',
      text: `${streak}日連続達成！すごい！このまま perfect week を目指そう`,
      type: 'celebrate',
    }
  }
  if (streak >= 3) {
    return {
      emoji: '🔥',
      text: `${streak}日連続！もう少しで1週間！今日も忘れずに！`,
      type: 'encourage',
    }
  }
  if (streak > 0 && todayCompleted < TIMINGS.length) {
    return {
      emoji: '💪',
      text: `${streak}日連続中！今日もあと${TIMINGS.length - todayCompleted}回！`,
      type: 'encourage',
    }
  }

  // 苦手なタイミングをチェック
  const weakTimings = timingStats.filter(s => s.rate < 60 && s.total >= 3)
  if (weakTimings.length > 0) {
    const weakNames = weakTimings.map(s => s.timing).join('・')
    return {
      emoji: '👀',
      text: `${weakNames}の服薬率が${weakTimings[0].rate}%です。気をつけて！`,
      type: 'warning',
    }
  }

  // 今日まだ記録がない
  if (todayCompleted === 0) {
    return {
      emoji: '⏰',
      text: '今日はまだ記録がないよ！朝のお薬から始めよう',
      type: 'nudge',
    }
  }

  // デフォルト
  return {
    emoji: '📝',
    text: '今日もお薬を忘れずに！コツコツ続けよう',
    type: 'encourage',
  }
}

// GET /api/insights
export async function GET(request: Request) {
  let household
  try {
    household = await resolveRequestHousehold(request)
  } catch (error) {
    const unauthorized = unauthorizedHouseholdResponse(error)
    if (unauthorized) return unauthorized
    throw error
  }

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const from = format(subDays(now, 30), 'yyyy-MM-dd')
  const to = format(now, 'yyyy-MM-dd')

  const records = await listRecordsForHousehold(household, { from, to })

  // 今日の記録
  const todayRecords = records.filter(r => r.date === today)
  const todayCompleted = todayRecords.length

  // 統計
  const streak = computeStreak(records)
  const totalDays = 30
  const timingStats = computeTimingStats(records, totalDays)
  const monthlyRate = computeMonthlyRate(records)
  const message = generateMessage(streak, timingStats, todayCompleted)

  // おどし: streakが途切れそうなとき
  let threat: string | null = null
  if (streak > 0 && todayCompleted === 0) {
    if (streak >= 7) {
      threat = `🔥 ${streak}日連続がかかってるよ！今日飲まないとリセットされちゃう！`
    } else if (streak >= 3) {
      threat = `💥 ${streak}日連続、今日で${streak + 1}日！あと${7 - streak}日で1週間だよ！`
    } else {
      threat = `⚠️ 連続記録が止まっちゃう！今日も忘れずにね`
    }
  }

  // バッジ
  const perfectDays = countPerfectDays(records)
  const badges = computeBadges({ streak, timingStats, monthlyRate: monthlyRate.rate, perfectDays })

  return Response.json({
    streak,
    todayCompleted,
    totalTimings: TIMINGS.length,
    timingStats,
    monthlyRate,
    message,
    threat,
    badges,
  })
}