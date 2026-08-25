import test from 'node:test'
import assert from 'node:assert/strict'
import {
  externalRows,
  isNativeWorkspaceBridge,
  mergedSessionList,
  mergedWorkspaceList,
  originOf,
  parseRemoteId,
  remoteId,
  remoteSessionSummaries,
  remoteWorkspaceViews,
} from '../dist/workspace-sidebar-model.js'

const SNAPSHOT = {
  generatedAt: 1,
  servers: {},
  rows: [
    {
      kind: 'workspace', hostId: 'one', hostName: 'Mac', hostUrl: 'http://127.0.0.1:3080/', hostLocal: true,
      id: 'local', title: 'Companion', path: '/tmp/dsh-companion', updatedAt: 2, totalSessions: 1,
      sessions: [{ id: 's1', title: 'Build unified sidebar', cwd: '/tmp/dsh-companion', updatedAt: 2 }],
    },
    {
      kind: 'workspace', hostId: 'two', hostName: 'Xavier', hostUrl: 'https://xavier.tail.test/', hostLocal: false,
      id: 'remote', title: 'Losttale', path: 'C:\\Devs\\Lost\\losttale', updatedAt: 10, totalSessions: 1,
      sessions: [{ id: 's9', title: 'Ship release', cwd: 'C:\\Devs\\Lost\\losttale', updatedAt: 10 }],
    },
  ],
  orphanSessions: [
    {
      kind: 'session', hostId: 'two', hostName: 'Xavier', hostUrl: 'https://xavier.tail.test/', hostLocal: false,
      id: 'orphan1', title: 'Loose session', cwd: null, createdAt: 5, updatedAt: 6,
    },
  ],
}

test('detects only complete native workspace bridges', () => {
  const bridge = { getSnapshot() {}, refresh() {}, connect() {} }
  assert.equal(isNativeWorkspaceBridge(bridge), true)
  assert.equal(isNativeWorkspaceBridge({ getSnapshot() {}, refresh() {} }), false)
  assert.equal(isNativeWorkspaceBridge(null), false)
})

test('normalizes origins and round-trips the remote id scheme', () => {
  assert.equal(originOf('https://xavier.tail.test/path'), 'https://xavier.tail.test')
  assert.equal(originOf('bad'), null)
  const id = remoteId('host-1', 'ws-7')
  assert.deepEqual(parseRemoteId(id), { hostId: 'host-1', id: 'ws-7' })
  assert.equal(parseRemoteId('local-ws'), undefined)
  assert.equal(parseRemoteId('remote:host-only'), undefined)
})

test('drops rows already rendered by the current server', () => {
  const rows = externalRows(SNAPSHOT, 'http://127.0.0.1:3080')
  assert.deepEqual(rows.map((row) => row.id), ['remote'])
})

test('projects external workspaces as wire-shaped views with server-named titles', () => {
  const views = remoteWorkspaceViews(SNAPSHOT, 'http://127.0.0.1:3080')
  assert.equal(views.length, 1)
  assert.deepEqual(views[0], {
    workspaceId: 'remote:two:remote',
    path: 'C:\\Devs\\Lost\\losttale',
    title: 'Losttale · Xavier',
    sessionIds: ['remote:two:s9'],
    createdAt: new Date(10).toISOString(),
    updatedAt: new Date(10).toISOString(),
  })
})

test('projects external sessions including ungrouped orphans', () => {
  const sessions = remoteSessionSummaries(SNAPSHOT, 'http://127.0.0.1:3080')
  assert.deepEqual(sessions.map((session) => session.id), ['remote:two:s9', 'remote:two:orphan1'])
  assert.ok(sessions.every((session) => session.running === false && session.blank === false))
})

test('merged session list appends synthetic rows and stays stable without them', () => {
  const local = { ids: ['a'], byId: { a: { id: 'a', displayTitle: 'A', running: false, blank: false, updatedAt: 1 } } }
  const merged = mergedSessionList(local, SNAPSHOT, 'http://127.0.0.1:3080')
  assert.deepEqual(merged.ids, ['a', 'remote:two:s9', 'remote:two:orphan1'])
  assert.equal(merged.byId['remote:two:s9'].displayTitle, 'Ship release')
  // The pure merge rebuilds per call; referential caching is the consumer's job.
  assert.deepEqual(mergedSessionList(local, SNAPSHOT, 'http://127.0.0.1:3080'), merged)
  // Nothing external for the current-origin-only snapshot: identity preserved.
  const localOnlySnapshot = { ...SNAPSHOT, rows: [SNAPSHOT.rows[0]], orphanSessions: [] }
  assert.equal(mergedSessionList(local, localOnlySnapshot, 'http://127.0.0.1:3080'), local)
})

test('merged workspace list appends remote groups once and keeps identity otherwise', () => {
  const local = { items: [{ workspaceId: 'w1' }], archivedSessionIds: [] }
  const merged = mergedWorkspaceList(local, SNAPSHOT, 'http://127.0.0.1:3080')
  assert.deepEqual(merged.items.map((view) => view.workspaceId), ['w1', 'remote:two:remote'])
  assert.equal(mergedWorkspaceList(merged, SNAPSHOT, 'http://127.0.0.1:3080'), merged)
  const localOnlySnapshot = { ...SNAPSHOT, rows: [SNAPSHOT.rows[0]] }
  assert.equal(mergedWorkspaceList(local, localOnlySnapshot, 'http://127.0.0.1:3080'), local)
})
