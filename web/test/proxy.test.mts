import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server.js'
import { createAccessToken, MVP_ACCESS_COOKIE } from '../src/lib/mvp-access.ts'
import { proxy } from '../src/proxy.ts'

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  MVP_ACCESS_CODE: process.env.MVP_ACCESS_CODE,
  MVP_SESSION_SECRET: process.env.MVP_SESSION_SECRET,
}

test.before(() => {
  process.env.NODE_ENV = 'production'
  process.env.MVP_ACCESS_CODE = 'family-access-code-1234'
  process.env.MVP_SESSION_SECRET = 'a-session-secret-that-is-longer-than-thirty-two-characters'
})

test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('protected pages redirect and protected APIs return 401', async () => {
  const pageResponse = await proxy(new NextRequest('https://example.test/'))
  assert.equal(pageResponse.status, 307)
  assert.equal(pageResponse.headers.get('location'), 'https://example.test/login')

  const apiResponse = await proxy(new NextRequest('https://example.test/api/records?date=2026-07-15'))
  assert.equal(apiResponse.status, 401)
})

test('legal pages remain public and a signed cookie unlocks protected pages', async () => {
  const publicResponse = await proxy(new NextRequest('https://example.test/privacy'))
  assert.equal(publicResponse.status, 200)
  const robotsResponse = await proxy(new NextRequest('https://example.test/robots.txt'))
  assert.equal(robotsResponse.status, 200)

  const token = await createAccessToken()
  const request = new NextRequest('https://example.test/', {
    headers: { cookie: `${MVP_ACCESS_COOKIE}=${token}` },
  })
  const authorizedResponse = await proxy(request)
  assert.equal(authorizedResponse.status, 200)
})
