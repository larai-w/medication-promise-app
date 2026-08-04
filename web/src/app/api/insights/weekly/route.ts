import { resolveRequestHousehold, unauthorizedHouseholdResponse } from '@/lib/household'
import { listRecordsForHousehold } from '@/lib/household-records.ts'
import { TIMINGS } from '@/lib/constants'
import { subDays, format } from 'date-fns'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import {
  buildBedrockWeeklyReportPrompt,
  buildWeeklyReportFacts,
  getBedrockWeeklyReportModelId,
  isBedrockWeeklyReportEnabled,
  renderGroundedWeeklyReportCandidate,
  renderRuleBasedWeeklyReport,
  validateGroundedWeeklyReportCandidate,
  WEEKLY_REPORT_SYSTEM_PROMPT,
  WEEKLY_REPORT_WINDOW_DAYS,
  type WeeklyReportFacts,
} from '@/lib/weekly-report'

// Bedrock クライアント（Lambda実行ロール or 環境変数で認証）
function getBedrockClient() {
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? 'ap-northeast-1',
  })
}

interface WeeklyReportResult {
  text: string
  source: 'ai' | 'rule_based'
}

async function generateWeeklyReport(
  facts: WeeklyReportFacts
): Promise<WeeklyReportResult> {
  // Health-record-derived data must not leave the application boundary unless the
  // owner explicitly enables this reviewed integration.
  const modelId = getBedrockWeeklyReportModelId()
  if (!isBedrockWeeklyReportEnabled() || !modelId) {
    return { text: renderRuleBasedWeeklyReport(facts), source: 'rule_based' }
  }

  const userPrompt = buildBedrockWeeklyReportPrompt(facts)

  const client = getBedrockClient()
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 200,
      system: WEEKLY_REPORT_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  try {
    const response = await client.send(command)
    const body = JSON.parse(new TextDecoder().decode(response.body))
    const text = body.content?.[0]?.text
    if (!text) {
      return { text: renderRuleBasedWeeklyReport(facts), source: 'rule_based' }
    }
    const candidate = validateGroundedWeeklyReportCandidate(JSON.parse(text), facts)
    return { text: renderGroundedWeeklyReportCandidate(candidate), source: 'ai' }
  } catch (error) {
    console.error('Bedrock error:', error)
    return { text: renderRuleBasedWeeklyReport(facts), source: 'rule_based' }
  }
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
  const from = format(subDays(now, WEEKLY_REPORT_WINDOW_DAYS - 1), 'yyyy-MM-dd')
  const to = format(now, 'yyyy-MM-dd')

  const records = await listRecordsForHousehold(household, { from, to })
  const facts = buildWeeklyReportFacts(records, { from, to, expectedTimings: TIMINGS })
  const { text, source } = await generateWeeklyReport(facts)

  return Response.json({
    report: text,
    source,
    facts,
    generatedAt: now.toISOString(),
    period: { from, to },
  })
}
