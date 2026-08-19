import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const apiRoot = new URL('../src/app/api/', import.meta.url)

async function findRouteFiles(directory: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const routes: string[] = []

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      routes.push(...await findRouteFiles(new URL(`${entry.name}/`, directory), relative))
    } else if (entry.name === 'route.ts') {
      routes.push(relative)
    }
  }

  return routes.sort()
}

const publicOrSessionOnlyRoutes = new Set([
  'access/login/route.ts',
  'access/logout/route.ts',
  'auth/callback/route.ts',
  'auth/login/route.ts',
])

const protectedRouteMarkers: Record<string, RegExp> = {
  'account/data/route.ts': /makeAccountDeletionHandlers/,
  'condition/route.ts': /resolveRequestHousehold/,
  'insights/route.ts': /resolveRequestHousehold/,
  'insights/weekly/route.ts': /resolveRequestHousehold/,
  'metrics/record-time/route.ts': /resolveRequestHousehold/,
  'records/[id]/route.ts': /makeRecordItemHandlers/,
  'records/export/route.ts': /makeCareEventExportHandler/,
  'records/pdf/route.ts': /makePdfHandler/,
  'records/route.ts': /makeRecordsHandlers/,
  'settings/route.ts': /makeSettingsHandlers/,
}

test('every API route has an explicit public or household-boundary classification', async () => {
  const discovered = await findRouteFiles(apiRoot)
  const classified = [
    ...publicOrSessionOnlyRoutes,
    ...Object.keys(protectedRouteMarkers),
  ].sort()

  assert.deepEqual(
    discovered,
    classified,
    'Classify each new API route before release; protected routes must resolve the server-side household.'
  )
})

test('every protected API route keeps its reviewed server-side household boundary', async () => {
  for (const [route, marker] of Object.entries(protectedRouteMarkers)) {
    const source = await readFile(new URL(route, apiRoot), 'utf8')
    assert.match(source, marker, `${route} is missing its reviewed household boundary`)
  }
})
