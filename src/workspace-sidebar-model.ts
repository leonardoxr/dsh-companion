export interface NativeWorkspaceSession {
  id: string
  title: string
  cwd: string | null
  updatedAt: number
}

export interface NativeWorkspaceRow {
  kind: 'workspace'
  hostId: string
  hostName: string
  hostUrl: string
  hostLocal: boolean
  id: string
  title: string
  path: string
  updatedAt: number
  totalSessions: number
  liveSessions: number | null
  sessions: NativeWorkspaceSession[] | null
  stale?: boolean
}

export interface NativeWorkspaceServer {
  id: string
  name: string
  url: string
  local: boolean
  status: 'loading' | 'online' | 'unavailable' | 'cache'
}

export interface NativeWorkspaceSnapshot {
  generatedAt: number
  servers: Record<string, NativeWorkspaceServer>
  rows: NativeWorkspaceRow[]
}

export interface NativeWorkspaceBridge {
  getSnapshot(): Promise<NativeWorkspaceSnapshot>
  refresh(): Promise<NativeWorkspaceSnapshot>
  connect(hostId: string): Promise<void>
}

export function isNativeWorkspaceBridge(value: unknown): value is NativeWorkspaceBridge {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<NativeWorkspaceBridge>
  return typeof candidate.getSnapshot === 'function'
    && typeof candidate.refresh === 'function'
    && typeof candidate.connect === 'function'
}

export function originOf(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function filterWorkspaceRows(rows: readonly NativeWorkspaceRow[], query: string): NativeWorkspaceRow[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return [...rows]
  return rows.filter((row) => [
    row.title,
    row.path,
    row.hostName,
    row.hostUrl,
    ...(row.sessions ?? []).map((session) => session.title),
  ].some((value) => value.toLocaleLowerCase().includes(needle)))
}

export function sessionCountLabel(row: NativeWorkspaceRow): string {
  if (row.liveSessions !== null && row.liveSessions !== row.totalSessions) {
    return `${row.liveSessions} of ${row.totalSessions}`
  }
  return String(row.totalSessions)
}
