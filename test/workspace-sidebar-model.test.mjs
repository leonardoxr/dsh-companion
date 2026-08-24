import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterWorkspaceRows,
  isNativeWorkspaceBridge,
  originOf,
  sessionCountLabel,
} from '../dist/workspace-sidebar-model.js'

const ROWS = [
  {
    kind: 'workspace', hostId: 'one', hostName: 'Mac', hostUrl: 'http://127.0.0.1:3080/', hostLocal: true,
    id: 'local', title: 'Companion', path: '/tmp/dsh-companion', updatedAt: 2, totalSessions: 3, liveSessions: 1,
    sessions: [{ id: 's1', title: 'Build unified sidebar', cwd: '/tmp/dsh-companion', updatedAt: 2 }],
  },
  {
    kind: 'workspace', hostId: 'two', hostName: 'Xavier', hostUrl: 'https://xavier.tail.test/', hostLocal: false,
    id: 'remote', title: 'Losttale', path: 'C:\\Devs\\Lost\\losttale', updatedAt: 1, totalSessions: 5, liveSessions: 5,
    sessions: [],
  },
]

test('detects only complete native workspace bridges', () => {
  const bridge = { getSnapshot() {}, refresh() {}, connect() {} }
  assert.equal(isNativeWorkspaceBridge(bridge), true)
  assert.equal(isNativeWorkspaceBridge({ getSnapshot() {}, refresh() {} }), false)
  assert.equal(isNativeWorkspaceBridge(null), false)
})

test('filters workspaces by workspace, server, path, and session labels', () => {
  assert.deepEqual(filterWorkspaceRows(ROWS, 'xavier').map((row) => row.id), ['remote'])
  assert.deepEqual(filterWorkspaceRows(ROWS, 'build unified').map((row) => row.id), ['local'])
  assert.deepEqual(filterWorkspaceRows(ROWS, '  ').map((row) => row.id), ['local', 'remote'])
})

test('normalizes origins and formats live versus total counts', () => {
  assert.equal(originOf('https://xavier.tail.test/path'), 'https://xavier.tail.test')
  assert.equal(originOf('bad'), null)
  assert.equal(sessionCountLabel(ROWS[0]), '1 of 3')
  assert.equal(sessionCountLabel(ROWS[1]), '5')
})
