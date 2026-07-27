import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { listRecordsForHousehold } from '@/lib/household-records.ts'
import { TIMINGS } from '@/lib/constants'
import { subDays, format, parseISO } from 'date-fns'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import type { MedicationRecord } from '@/types'

// Bedrock クライアント（Lambda実行ロール or 環境変数で認証）
function getBedrockClient() {
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? 'ap-northeast-1',
  })
}

async function generateWeeklyReport(
  records: MedicationRecord[]
): Promise<string> {
  const now = new Date()
  const weekAgo = subDays(now, 7)
  const weekRecords = records.filter(r => {
    const d = parseISO(r.date)
    return d >= weekAgo && d <= now
  })

  // 週間統計を計算
  const byDate = weekRecords.reduce<Record<string, string[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = []
    acc[r.date].push(`${r.timing}(${r.time})${r.notes ? ` [${r.notes}]` : ''}`)
    return acc
  }, {})
  const dates = Object.keys(byDate).sort()
  const totalDays = dates.length
  const allTimingsCount = TIMINGS.length * totalDays
  // 重複記録を除外: (date, timing) のユニークペアでカウント
  const uniquePairs = new Set(weekRecords.map(r => `${r.date}|${r.timing}`))
  const completedCount = uniquePairs.size
  const rate = allTimingsCount > 0 ? Math.min(100, Math.round((completedCount / allTimingsCount) * 100)) : 0

  // メモ一覧
  const notes = weekRecords.filter(r => r.notes).map(r => `[${r.date} ${r.timing}] ${r.notes}`)

  // プロンプト構築
  const systemPrompt = 'あなたは服薬管理アプリ「おくすりの約束」のやさしいコーチです。ユーザーの服薬データから、親しみやすい日本語で2〜3文の週間レポートを生成してください。具体的な数字やアドバイスを含めてください。敬体（ですます調）でお願いします。'

  const userPrompt = `## 今週の服薬データ（${dates[0] ?? '?'} 〜 ${dates[dates.length - 1] ?? '?'}）
- 服薬記録日数: ${totalDays}日
- 服薬完了率: ${rate}%（全${TIMINGS.length}種目中 ${completedCount}回）
- 各日の記録:
${dates.map(d => `  - ${d}: ${byDate[d]?.join(', ') ?? '記録なし'}`).join('\n')}
${notes.length > 0 ? `- メモ:\n${notes.map(n => `  - ${n}`).join('\n')}` : '- メモ: なし'}

上記のデータから、ユーザーへの週間レポートを日本語で2〜3文で生成してください。`

  const client = getBedrockClient()
  const command = new InvokeModelCommand({
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  try {
    const response = await client.send(command)
    const body = JSON.parse(new TextDecoder().decode(response.body))
    return body.content?.[0]?.text ?? '今週のレポートを生成できませんでした。'
  } catch (error) {
    console.error('Bedrock error:', error)
    // Bedrockが使えない場合のフォールバック
    return fallbackReport(totalDays, rate, notes)
  }
}

function fallbackReport(totalDays: number, rate: number, notes: string[]): string {
  let report = `今週は${totalDays}日間、服薬を記録しました。完了率は${rate}%です。`
  if (rate >= 80) {
    report += ' とても良い調子です！この調子で続けていきましょう。'
  } else if (rate >= 50) {
    report += ' もう少しです。毎日の習慣にしていきましょう。'
  } else {
    report += ' 記録が少なめです。お薬を飲んだら忘れずに記録してくださいね。'
  }
  if (notes.length > 0) {
    report += ` メモが${notes.length}件ありました。体調の変化に気をつけてください。`
  }
  return report
}

// GET /api/insights/weekly
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
  const from = format(subDays(now, 7), 'yyyy-MM-dd')
  const to = format(now, 'yyyy-MM-dd')

  const records = await listRecordsForHousehold(household, { from, to })

  const report = await generateWeeklyReport(records)

  return Response.json({
    report,
    generatedAt: now.toISOString(),
    period: { from, to },
  })
}