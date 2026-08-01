import { makeRecordsHandlers } from '@/lib/api-handlers'

const handlers = makeRecordsHandlers()

export const GET = handlers.GET
export const POST = handlers.POST
