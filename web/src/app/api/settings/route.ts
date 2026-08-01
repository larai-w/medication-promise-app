import { makeSettingsHandlers } from '@/lib/api-handlers'

const handlers = makeSettingsHandlers()

export const GET = handlers.GET
export const PUT = handlers.PUT
