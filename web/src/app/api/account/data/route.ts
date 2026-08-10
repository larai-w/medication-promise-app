import { makeAccountDeletionHandlers } from '@/lib/account-deletion-handler'

const handlers = makeAccountDeletionHandlers()

export const GET = handlers.GET
export const DELETE = handlers.DELETE
