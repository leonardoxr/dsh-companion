import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { apply, inject, name } from '../dist/index.js'

function responseRecorder() {
  return {
    status: undefined,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = body
    },
  }
}

test('package entry point is compiled JavaScript', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.main, './dist/index.js')
  assert.equal(pkg.exports['.'].default, './dist/index.js')
  assert.equal(name, 'dsh-companion')
  assert.deepEqual(inject, ['webServer', 'webRuntime', 'sessions', 'sessionTitle', 'workspaceRegistry'])
})

test('compiled plugin registers working read-only routes and disposes them', async () => {
  const routes = []
  let disposed = 0
  const session = { id: 'session-1', header: { createdAt: 123, cwd: 'C:/workspace' }, seq: 7 }
  const ctx = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => { disposed += 1 }
      },
    },
    webRuntime: {
      trustedHosts: ['xavier', 'xavier.tail6fa18.ts.net'],
    },
    sessions: {
      list: () => [session],
      get: id => id === session.id ? session : undefined,
    },
    sessionTitle: {
      get: () => ({ title: 'Session title' }),
    },
    workspaceRegistry: {
      list: () => [{
        id: 'workspace-1',
        path: 'C:/workspace',
        title: 'Workspace',
        createdAt: '2026-08-22T00:00:00.000Z',
        updatedAt: '2026-08-22T00:00:00.000Z',
        sessionIds: [session.id],
      }],
    },
  }

  const dispose = apply(ctx)
  assert.equal(routes.length, 3)

  const sessionsRoute = routes.find(route => route.path === '/api/companion/sessions')
  const sessionsResponse = responseRecorder()
  await sessionsRoute.handler({ method: 'GET', url: sessionsRoute.path, headers: { host: 'xavier:3080' } }, sessionsResponse)
  assert.equal(sessionsResponse.status, 200)
  assert.equal(sessionsResponse.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(sessionsResponse.body), {
    sessions: [{ id: session.id, title: 'Session title', cwd: 'C:/workspace', createdAt: 123 }],
  })

  const sessionRoute = routes.find(route => route.path === '/api/companion/session')
  const missingResponse = responseRecorder()
  await sessionRoute.handler({ method: 'GET', url: '/api/companion/session/missing', headers: { host: '127.0.0.1:3080' } }, missingResponse)
  assert.equal(missingResponse.status, 404)

  const methodResponse = responseRecorder()
  await sessionsRoute.handler({ method: 'POST', url: sessionsRoute.path, headers: { host: 'xavier' } }, methodResponse)
  assert.equal(methodResponse.status, 405)

  for (const headers of [
    { host: 'untrusted.invalid' },
    { host: 'xavier', origin: 'http://untrusted.invalid' },
    { host: 'xavier', 'sec-fetch-site': 'cross-site' },
    {},
  ]) {
    const untrustedResponse = responseRecorder()
    await sessionsRoute.handler({ method: 'GET', url: sessionsRoute.path, headers }, untrustedResponse)
    assert.equal(untrustedResponse.status, 403)
  }

  dispose()
  assert.equal(disposed, 3)
})
