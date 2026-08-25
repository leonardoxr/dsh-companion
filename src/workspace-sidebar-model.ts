/**
 * Data model for the native cross-server workspace sidebar.
 *
 * The stock WorkspaceBrowser renders exclusively from the framework's
 * global `useWorkspaces` / `useSessions` selector hooks. This module merges
 * Companion's cross-server snapshot into those shapes under a
 * `remote:<hostId>:<id>` id scheme, so the stock component renders other
 * computers' workspaces as first-class rows with zero visual divergence.
 */

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
  orphanSessions?: Array<{
    kind: 'session'
    hostId: string
    hostName: string
    hostUrl: string
    hostLocal: boolean
    id: string
    title: string
    cwd: string | null
    createdAt: number
    updatedAt: number
    stale?: boolean
  }>
}

export interface NativeWorkspaceBridge {
  getSnapshot(): Promise<NativeWorkspaceSnapshot>
  refresh(): Promise<NativeWorkspaceSnapshot>
  connect(hostId: string): Promise<void>
}

/** Structural guard for the DSH Native preload bridge. */
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

// ---------------------------------------------------------------------------
// Remote id scheme
// ---------------------------------------------------------------------------

export const REMOTE_PREFIX = 'remote:'

/** Synthetic id for a remote workspace or session row. */
export function remoteId(hostId: string, id: string): string {
  return `${REMOTE_PREFIX}${hostId}:${id}`
}

export interface RemoteRef {
  hostId: string
  id: string
}

/** Split a synthetic remote id back into its host and native halves. */
export function parseRemoteId(id: string): RemoteRef | undefined {
  if (!id.startsWith(REMOTE_PREFIX)) return undefined
  const rest = id.slice(REMOTE_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep <= 0 || sep === rest.length - 1) return undefined
  return { hostId: rest.slice(0, sep), id: rest.slice(sep + 1) }
}

/**
 * Rows contributed by the server the page already runs on are dropped: that
 * server is rendered natively by the live runtime hooks, and duplicating it
 * would list every local workspace twice.
 */
export function externalRows(snapshot: NativeWorkspaceSnapshot | null, currentOrigin: string): NativeWorkspaceRow[] {
  if (snapshot === null) return []
  return snapshot.rows.filter((row) => {
    const rowOrigin = originOf(row.hostUrl)
    return rowOrigin !== null && rowOrigin !== currentOrigin
  })
}

// ---------------------------------------------------------------------------
// Merge projections
// ---------------------------------------------------------------------------

/** Minimal structural mirror of the runtime session summary row. */
export interface MergedSessionSummary {
  id: string
  title?: string
  displayTitle: string
  cwd?: string
  running: boolean
  blank: boolean
  updatedAt: number
  origin?: 'subagent'
}

/** Minimal structural mirror of the host wire WorkspaceView. */
export interface MergedWorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}

function iso(epoch: number): string {
  return new Date(epoch).toISOString()
}

/**
 * Synthetic WorkspaceView rows for every workspace owned by another saved
 * server, most-recent-first as delivered by the aggregator. Titles carry the
 * owning server name so rows stay distinguishable inside one list; everything
 * else matches the wire projection field-for-field.
 */
export function remoteWorkspaceViews(
  snapshot: NativeWorkspaceSnapshot | null,
  currentOrigin: string,
): MergedWorkspaceView[] {
  return externalRows(snapshot, currentOrigin).map((row) => ({
    workspaceId: remoteId(row.hostId, row.id),
    path: row.path,
    title: `${row.title} · ${row.hostName}`,
    sessionIds: (row.sessions ?? []).map((session) => remoteId(row.hostId, session.id)),
    createdAt: iso(row.updatedAt),
    updatedAt: iso(row.updatedAt),
  }))
}

/**
 * Synthetic SessionSummary rows for sessions of external servers, including
 * orphans (sessions no workspace claims — the stock browser files them under
 * Ungrouped exactly like local orphans).
 */
export function remoteSessionSummaries(
  snapshot: NativeWorkspaceSnapshot | null,
  currentOrigin: string,
): MergedSessionSummary[] {
  if (snapshot === null) return []
  const summaries: MergedSessionSummary[] = []
  const push = (hostId: string, session: { id: string; title: string; cwd: string | null; updatedAt: number }): void => {
    summaries.push({
      id: remoteId(hostId, session.id),
      displayTitle: session.title,
      cwd: session.cwd ?? undefined,
      running: false,
      blank: false,
      updatedAt: session.updatedAt,
    })
  }
  for (const row of externalRows(snapshot, currentOrigin)) {
    for (const session of row.sessions ?? []) push(row.hostId, session)
  }
  for (const orphan of snapshot.orphanSessions ?? []) {
    const orphanOrigin = originOf(orphan.hostUrl)
    if (orphanOrigin === null || orphanOrigin === currentOrigin) continue
    push(orphan.hostId, orphan)
  }
  return summaries
}

// ---------------------------------------------------------------------------
// State merges (structural mirrors of the runtime store shapes)
// ---------------------------------------------------------------------------

/** Structural subset of the runtime session state this module rewrites. */
export interface SessionListStateCore {
  ids: string[]
  byId: Record<string, object>
}

/** Structural subset of the runtime workspace state this module rewrites. */
export interface WorkspaceListStateCore {
  items: object[]
}

/**
 * Local session list plus every external-server session as synthetic rows.
 * Returns the input unchanged when there is nothing to add, so callers keep
 * referential stability across purely local updates.
 */
export function mergedSessionList<T extends SessionListStateCore>(
  local: T,
  snapshot: NativeWorkspaceSnapshot | null,
  currentOrigin: string,
): T {
  const extra = remoteSessionSummaries(snapshot, currentOrigin)
  if (extra.length === 0) return local
  const byId: Record<string, object> = { ...local.byId }
  const ids = [...local.ids]
  for (const summary of extra) {
    if (byId[summary.id] !== undefined) continue
    byId[summary.id] = summary
    ids.push(summary.id)
  }
  return { ...local, ids, byId }
}

/**
 * Local workspace list plus one synthetic view per external workspace.
 * Remote groups append after the local durable order so "other computers"
 * reads as a contiguous tail of the same list.
 */
export function mergedWorkspaceList<T extends WorkspaceListStateCore>(
  local: T,
  snapshot: NativeWorkspaceSnapshot | null,
  currentOrigin: string,
): T {
  const views = remoteWorkspaceViews(snapshot, currentOrigin)
  if (views.length === 0) return local
  const known = new Set(local.items.map((item) => (item as { workspaceId: string }).workspaceId))
  const additions = views.filter((view) => !known.has(view.workspaceId))
  if (additions.length === 0) return local
  return { ...local, items: [...local.items, ...additions] }
}
