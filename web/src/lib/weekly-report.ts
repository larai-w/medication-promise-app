type WeeklyReportEnvironment = {
  [key: string]: string | undefined
  BEDROCK_WEEKLY_REPORT_ENABLED?: string
}

export function isBedrockWeeklyReportEnabled(
  env: WeeklyReportEnvironment = process.env
): boolean {
  return env.BEDROCK_WEEKLY_REPORT_ENABLED === 'true'
}
