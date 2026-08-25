import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { apply, Config, inject, name, SETTINGS_NAMESPACE } from '../dist/index.js'

function responseRecorder() {
  return {
    status: undefined,
    headers: undefined,
    body: undefined,
    writes: [],
    destroyed: false,
    writableEnded: false,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    flushHeaders() {},
    once() {},
    write(chunk) {
      this.writes.push(String(chunk))
      return true
    },
    end(body) {
      this.body = body
      this.writableEnded = true
    },
  }
}

function request(method, url, headers = { host: 'xavier' }) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = headers
  return req
}

function streamSource() {
  const subscribers = []
  return {
    open(_request, signal) {
      const values = []
      const waiters = []
      const finish = () => {
        while (waiters.length) waiters.shift()({ done: true, value: undefined })
      }
      signal.addEventListener('abort', finish, { once: true })
      const subscriber = {
        push(value) {
          const waiter = waiters.shift()
          if (waiter) waiter({ done: false, value })
          else values.push(value)
        },
      }
      subscribers.push(subscriber)
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              if (values.length) return Promise.resolve({ done: false, value: values.shift() })
              if (signal.aborted) return Promise.resolve({ done: true, value: undefined })
              return new Promise(resolve => waiters.push(resolve))
            },
          }
        },
      }
    },
    push(rpcId, payload) {
      for (const subscriber of subscribers) subscriber.push({ rpcId, payload })
    },
  }
}

function notifications(response) {
  return response.writes
    .join('')
    .split('\n\n')
    .filter(block => block.includes('event: notification'))
    .map(block => {
      const line = block.split('\n').find(candidate => candidate.startsWith('data: '))
      return JSON.parse(line.slice(6))
    })
}

function createHarness(sessionOverrides = {}) {
  const routes = []
  const mux = streamSource()
  const host = streamSource()
  let disposed = 0
  const session = {
    id: 'session-1',
    header: { createdAt: 123, cwd: 'C:/workspace', ...sessionOverrides },
    seq: 7,
  }
  const subagent = {
    id: 'session-child',
    header: { createdAt: 124, cwd: 'C:/workspace', origin: 'subagent' },
    seq: 2,
  }
  const sessions = new Map([[session.id, session], [subagent.id, subagent]])
  const settingsRegistrations = []
  const ctx = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => { disposed += 1 }
      },
    },
    webRuntime: { trustedHosts: ['xavier', 'xavier.tail6fa18.ts.net'] },
    apiProxy: {
      events: {
        mux: (...args) => mux.open(...args),
        host: (...args) => host.open(...args),
      },
      sessions: {
        list: async request => ({
          rpcId: request.rpcId,
          payload: { items: [{ sessionId: session.id, updatedAt: 456, cwd: 'C:/workspace', running: true, blank: false }] },
        }),
      },
    },
    settings: {
      register(namespace, schema, options) {
        const registration = { namespace, schema, value: options.base }
        settingsRegistrations.push(registration)
        return { get: () => registration.value }
      },
    },
    sessions: {
      list: () => [...sessions.values()],
      get: id => sessions.get(id),
    },
    sessionTitle: {
      get: candidate => ({ title: candidate.id === subagent.id ? 'Child task' : 'Session title' }),
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
  return { ctx, disposed: () => disposed, host, mux, routes, session, settingsRegistrations }
}

const tick = () => new Promise(resolve => setImmediate(resolve))

test('package entry point and settings schema are compiled', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.main, './dist/index.js')
  assert.equal(pkg.exports['.'].default, './dist/index.js')
  assert.equal(pkg.exports['./client'].default, './client/client.js')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'))
  const client = await readFile(new URL('../client/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(client, /const inject = \[\s*"slots",\s*"settingsScope",\s*"betterSidebar"/)
  assert.match(client, /^window\.__ModuleLoader__\.load\(\{ id: "dsh-companion"/)
  assert.match(client, /companion-notifications/)
  // The native sidebar ships the vendored stock WorkspaceBrowser, not custom styles.
  assert.doesNotMatch(client, /dsc-workspaces/)
  assert.match(client, /sidebar\.workspaces/)
  assert.match(client, /remote:/)
  assert.equal(name, 'dsh-companion')
  assert.deepEqual(inject, ['webServer', 'webRuntime', 'apiProxy', 'settings', 'sessions', 'sessionTitle', 'workspaceRegistry'])
  assert.equal(SETTINGS_NAMESPACE, 'companion-notifications')
  assert.deepEqual(Config({}), {
    notifications: {
      completed: true,
      blocked: true,
      errors: true,
      maxTokens: true,
      aborted: false,
      questions: true,
      approvals: true,
      subagents: false,
    },
  })
})

test('compiled plugin registers working read-only routes and disposes them', async () => {
  const harness = createHarness()
  const dispose = apply(harness.ctx)
  assert.equal(harness.routes.length, 4)
  assert.equal(harness.settingsRegistrations[0].namespace, SETTINGS_NAMESPACE)

  const sessionsRoute = harness.routes.find(route => route.path === '/api/companion/sessions')
  const sessionsResponse = responseRecorder()
  await sessionsRoute.handler(request('GET', sessionsRoute.path, { host: 'xavier:3080' }), sessionsResponse)
  assert.equal(sessionsResponse.status, 200)
  assert.equal(sessionsResponse.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(sessionsResponse.body).sessions[0], {
    id: harness.session.id,
    title: 'Session title',
    cwd: 'C:/workspace',
    createdAt: 123,
    updatedAt: 456,
  })

  const sessionRoute = harness.routes.find(route => route.path === '/api/companion/session')
  const missingResponse = responseRecorder()
  await sessionRoute.handler(request('GET', '/api/companion/session/missing', { host: '127.0.0.1:3080' }), missingResponse)
  assert.equal(missingResponse.status, 404)

  const methodResponse = responseRecorder()
  await sessionsRoute.handler(request('POST', sessionsRoute.path), methodResponse)
  assert.equal(methodResponse.status, 405)

  for (const headers of [
    { host: 'untrusted.invalid' },
    { host: 'xavier', origin: 'http://untrusted.invalid' },
    { host: 'xavier', 'sec-fetch-site': 'cross-site' },
    {},
  ]) {
    const untrustedResponse = responseRecorder()
    await sessionsRoute.handler(request('GET', sessionsRoute.path, headers), untrustedResponse)
    assert.equal(untrustedResponse.status, 403)
  }

  dispose()
  assert.equal(harness.disposed(), 4)
})

test('notification feed forwards configured turn and interaction alerts', async () => {
  const harness = createHarness()
  const dispose = apply(harness.ctx)
  const route = harness.routes.find(candidate => candidate.path === '/api/companion/notifications')
  const req = request('GET', route.path)
  const response = responseRecorder()
  await route.handler(req, response)

  assert.equal(response.status, 200)
  assert.match(response.headers['content-type'], /^text\/event-stream/)
  assert.match(response.writes.join(''), /event: ready/)

  harness.mux.push('turn-1', {
    type: 'session/event',
    sessionId: harness.session.id,
    event: { type: 'turn/end', seq: 8, time: 456, data: { turn: 1, reason: { kind: 'completed' } } },
  })
  harness.mux.push('question-1', {
    type: 'question/requested',
    sessionId: harness.session.id,
    questions: [{ id: 'choice', header: 'Choose', question: 'Which option?' }],
  })
  harness.mux.push('approval-rpc', {
    type: 'approval/requested',
    sessionId: harness.session.id,
    approvalId: 'approval-1',
    toolName: 'pwsh',
  })
  harness.host.push('error-1', {
    type: 'host/agent-error',
    sessionId: harness.session.id,
    message: 'Provider unavailable: caused by socket timeout',
  })
  harness.mux.push('failed-turn', {
    type: 'session/event',
    sessionId: harness.session.id,
    event: {
      type: 'turn/end',
      seq: 9,
      time: 457,
      data: { turn: 2, reason: { kind: 'error', error: { message: 'Provider unavailable' } } },
    },
  })
  harness.mux.push('child-turn', {
    type: 'session/event',
    sessionId: 'session-child',
    event: { type: 'turn/end', seq: 3, time: 789, data: { turn: 1, reason: { kind: 'completed' } } },
  })
  await tick()

  const alerts = notifications(response)
  assert.deepEqual(alerts.map(item => item.kind).sort(), ['approval', 'completed', 'error', 'question'])
  assert.equal(alerts.find(item => item.kind === 'completed').key, 'turn:session-1:8')
  assert.equal(alerts.find(item => item.kind === 'question').body, 'Choose: Which option?')
  assert.match(alerts.find(item => item.kind === 'approval').body, /pwsh/)
  assert.match(alerts.find(item => item.kind === 'error').body, /Provider unavailable/)

  harness.host.push('error-2', {
    type: 'host/agent-error',
    sessionId: harness.session.id,
    message: 'Second failure',
  })
  harness.host.push('error-3', {
    type: 'host/agent-error',
    sessionId: harness.session.id,
    message: 'Third failure',
  })
  harness.mux.push('failed-turn-2', {
    type: 'session/event',
    sessionId: harness.session.id,
    event: {
      type: 'turn/end',
      seq: 10,
      time: 458,
      data: { turn: 3, reason: { kind: 'error', error: { message: 'Second failure (outer)' } } },
    },
  })
  harness.mux.push('failed-turn-3', {
    type: 'session/event',
    sessionId: harness.session.id,
    event: {
      type: 'turn/end',
      seq: 11,
      time: 459,
      data: { turn: 4, reason: { kind: 'error', error: { message: 'Third failure (outer)' } } },
    },
  })
  await tick()
  const errorBodies = notifications(response).filter(item => item.kind === 'error').map(item => item.body)
  assert.equal(errorBodies.length, 3)
  assert.equal(errorBodies.filter(body => body.includes('Provider unavailable')).length, 1)
  assert.equal(errorBodies.filter(body => body.includes('Second failure')).length, 1)
  assert.equal(errorBodies.filter(body => body.includes('Third failure')).length, 1)

  const freshResponse = responseRecorder()
  await route.handler(request('GET', route.path), freshResponse)
  const readyId = /id: ([^\n]+)\nevent: ready/.exec(freshResponse.writes.join(''))?.[1]
  assert.ok(readyId)
  assert.equal(notifications(freshResponse).some(item => item.key === 'question:question-1'), true)

  const reconnectResponse = responseRecorder()
  await route.handler(request('GET', route.path, { host: 'xavier', 'last-event-id': readyId }), reconnectResponse)
  assert.equal(notifications(reconnectResponse).some(item => item.key === 'question:question-1'), true)

  harness.mux.push('question-resolved', {
    type: 'question/resolved',
    sessionId: harness.session.id,
    questionRpcId: 'question-1',
    outcome: 'answered',
  })
  await tick()
  const secondResponse = responseRecorder()
  await route.handler(request('GET', route.path), secondResponse)
  assert.equal(notifications(secondResponse).some(item => item.key === 'question:question-1'), false)

  req.emit('aborted')
  dispose()
  assert.equal(harness.disposed(), 4)
})

test('notification settings filter completed turns and can include subagents', async () => {
  const harness = createHarness()
  const config = Config({ notifications: { completed: false, subagents: true } })
  const dispose = apply(harness.ctx, config)
  const route = harness.routes.find(candidate => candidate.path === '/api/companion/notifications')
  const response = responseRecorder()
  await route.handler(request('GET', route.path), response)

  harness.mux.push('main-turn', {
    type: 'session/event',
    sessionId: harness.session.id,
    event: { type: 'turn/end', seq: 8, time: 1, data: { reason: { kind: 'completed' } } },
  })
  harness.mux.push('child-blocked', {
    type: 'session/event',
    sessionId: 'session-child',
    event: { type: 'turn/end', seq: 3, time: 2, data: { reason: { kind: 'blocked' } } },
  })
  await tick()

  assert.deepEqual(notifications(response).map(item => item.kind), ['blocked'])
  assert.equal(notifications(response)[0].title, 'Child task')

  harness.settingsRegistrations[0].value = {
    ...harness.settingsRegistrations[0].value,
    completed: true,
  }
  harness.mux.push('main-turn-enabled', {
    type: 'session/event',
    sessionId: harness.session.id,
    event: { type: 'turn/end', seq: 9, time: 3, data: { reason: { kind: 'completed' } } },
  })
  await tick()
  assert.deepEqual(notifications(response).map(item => item.kind), ['blocked', 'completed'])
  dispose()
})
