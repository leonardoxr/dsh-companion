import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import {
  filterWorkspaceRows,
  isNativeWorkspaceBridge,
  originOf,
  sessionCountLabel,
  type NativeWorkspaceBridge,
  type NativeWorkspaceRow,
  type NativeWorkspaceSnapshot,
} from '../workspace-sidebar-model.js'

const STYLE_ID = 'dsh-companion/native-workspace-sidebar'
const REFRESH_INTERVAL_MS = 60_000
const SHADOW_PRIORITY = -1

interface NativeWorkspaceSidebarProps {
  wide: boolean
  expandSidebar(): void
  useSessions<S>(selector: (state: SessionListState) => S): S
  startSession(workspaceId?: string): void
  open(sessionId: string): void
  bridge: NativeWorkspaceBridge
}

type CompanionClientContext = Context & {
  sessions: { open(sessionId: string): void }
  workspaces: { startSession(workspaceId?: string): void }
}

declare global {
  interface Window {
    dshNativeWorkspaces?: unknown
  }
}

export function nativeWorkspaceBridgeOf(value: unknown = window.dshNativeWorkspaces): NativeWorkspaceBridge | undefined {
  return isNativeWorkspaceBridge(value) ? value : undefined
}

function installWorkspaceStyles(): () => void {
  const existing = document.querySelector(`style[data-plugin="${STYLE_ID}"]`)
  existing?.remove()
  const tag = document.createElement('style')
  tag.dataset.plugin = STYLE_ID
  tag.textContent = `
    .dsc-workspaces { display:flex; min-height:0; flex:1; flex-direction:column; color:var(--ds-color-text-1,#f2f2f2); }
    .dsc-ws-head { display:flex; align-items:center; gap:8px; padding:18px 20px 10px; }
    .dsc-ws-title { flex:1; font-size:15px; font-weight:500; color:var(--ds-color-text-2,#b9b9bd); }
    .dsc-ws-icon { width:32px; height:32px; border:0; border-radius:8px; color:inherit; background:transparent; cursor:pointer; }
    .dsc-ws-icon:hover,.dsc-ws-icon:focus-visible { background:var(--ds-color-bg-3,#303033); outline:none; }
    .dsc-ws-search { margin:0 14px 8px; width:calc(100% - 28px); box-sizing:border-box; border:1px solid var(--ds-color-border-2,#3f3f43); border-radius:9px; padding:8px 10px; color:inherit; background:var(--ds-color-bg-2,#252527); }
    .dsc-ws-scroll { min-height:0; overflow:auto; padding:2px 10px 18px; scrollbar-gutter:stable; }
    .dsc-ws-empty,.dsc-ws-error { padding:18px 12px; color:var(--ds-color-text-3,#85858a); font-size:13px; line-height:1.45; }
    .dsc-ws-error { color:var(--ds-color-error,#df7777); }
    .dsc-ws-group { margin:2px 0; border-radius:10px; }
    .dsc-ws-row { display:flex; width:100%; min-width:0; align-items:center; border-radius:9px; background:transparent; }
    .dsc-ws-row:hover,.dsc-ws-row:focus-within { background:var(--ds-color-bg-3,#303033); }
    .dsc-ws-main { display:flex; min-width:0; flex:1; align-items:center; gap:8px; border:0; border-radius:9px; padding:8px 4px 8px 9px; text-align:left; color:inherit; background:transparent; cursor:pointer; }
    .dsc-ws-main:focus-visible { outline:1px solid var(--ds-color-primary,#72a7ff); outline-offset:-1px; }
    .dsc-ws-chevron { width:12px; color:var(--ds-color-text-3,#85858a); font-size:11px; }
    .dsc-ws-copy { min-width:0; flex:1; }
    .dsc-ws-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:550; }
    .dsc-ws-meta { display:flex; min-width:0; gap:6px; margin-top:3px; color:var(--ds-color-text-3,#85858a); font-size:10px; }
    .dsc-ws-server { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dsc-ws-current { color:var(--ds-color-primary,#72a7ff); }
    .dsc-ws-stale { opacity:.58; }
    .dsc-ws-new { width:28px; height:28px; flex:0 0 auto; margin-right:4px; border:0; border-radius:7px; color:inherit; background:transparent; cursor:pointer; font-size:17px; }
    .dsc-ws-new:hover,.dsc-ws-new:focus-visible { background:var(--ds-color-bg-4,#3a3a3e); outline:none; }
    .dsc-ws-sessions { margin-left:22px; padding:0 0 4px; }
    .dsc-session { display:flex; width:100%; min-width:0; align-items:center; gap:7px; border:0; border-radius:8px; padding:7px 9px; color:var(--ds-color-text-2,#c7c7ca); background:transparent; cursor:pointer; text-align:left; }
    .dsc-session:hover,.dsc-session:focus-visible,.dsc-session-selected { background:var(--ds-color-bg-3,#303033); color:var(--ds-color-text-1,#fff); outline:none; }
    .dsc-session-dot { width:5px; height:5px; flex:0 0 auto; border-radius:50%; background:var(--ds-color-text-3,#85858a); }
    .dsc-session-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
    .dsc-ws-rail { display:flex; flex:1; align-items:flex-start; justify-content:center; padding-top:16px; }
    .dsc-ws-rail .dsc-ws-icon { width:36px; height:36px; font-size:18px; }
    @media (prefers-reduced-motion:no-preference) { .dsc-ws-row,.dsc-ws-main,.dsc-ws-new,.dsc-session,.dsc-ws-icon { transition:background-color 120ms ease,color 120ms ease; } }
  `
  document.head.append(tag)
  return () => tag.remove()
}

function WorkspaceGroup(props: {
  row: NativeWorkspaceRow
  expanded: boolean
  currentOrigin: string
  currentSessionId: string | undefined
  onToggle(): void
  onConnect(): void
  onStartSession(): void
  onOpenSession(sessionId: string): void
}) {
  const { row, expanded, currentOrigin, currentSessionId, onToggle, onConnect, onStartSession, onOpenSession } = props
  const onCurrentHost = originOf(row.hostUrl) === currentOrigin
  const sessions = row.sessions ?? []
  return (
    <section className={`dsc-ws-group${row.stale === true ? ' dsc-ws-stale' : ''}`}>
      <div className="dsc-ws-row">
        <button className="dsc-ws-main" type="button" onClick={onToggle} title={row.path}>
          <span className="dsc-ws-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span className="dsc-ws-copy">
            <span className="dsc-ws-name">{row.title}</span>
            <span className="dsc-ws-meta">
              <span className={onCurrentHost ? 'dsc-ws-server dsc-ws-current' : 'dsc-ws-server'}>{row.hostName}</span>
              <span aria-label={`${row.totalSessions} sessions`}>{sessionCountLabel(row)}</span>
            </span>
          </span>
        </button>
        <button
          className="dsc-ws-new"
          type="button"
          title={onCurrentHost ? 'New session' : `Open ${row.hostName}`}
          aria-label={onCurrentHost ? `New session in ${row.title}` : `Open ${row.hostName}`}
          onClick={() => {
            if (onCurrentHost) onStartSession()
            else onConnect()
          }}
        >{onCurrentHost ? '+' : '↗'}</button>
      </div>
      {expanded && (
        <div className="dsc-ws-sessions">
          {sessions.map((session) => (
            <button
              className={`dsc-session${onCurrentHost && currentSessionId === session.id ? ' dsc-session-selected' : ''}`}
              type="button"
              key={session.id}
              title={session.cwd ?? session.title}
              onClick={() => {
                if (onCurrentHost) onOpenSession(session.id)
                else onConnect()
              }}
            >
              <span className="dsc-session-dot" aria-hidden="true" />
              <span className="dsc-session-label">{session.title}</span>
            </button>
          ))}
          {sessions.length === 0 && <div className="dsc-ws-empty">No sessions yet</div>}
        </div>
      )}
    </section>
  )
}

export function NativeWorkspaceSidebar(props: NativeWorkspaceSidebarProps) {
  const { wide, expandSidebar, useSessions, startSession, open, bridge } = props
  const currentSessionId = useSessions((state) => state.current)
  const [snapshot, setSnapshot] = useState<NativeWorkspaceSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const currentOrigin = window.location.origin

  const load = useCallback(async (refresh: boolean) => {
    try {
      const next = refresh ? await bridge.refresh() : await bridge.getSnapshot()
      setSnapshot(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [bridge])

  useEffect(() => {
    void load(false).then(() => load(true))
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (snapshot === null || expanded.size > 0) return
    const currentRows = snapshot.rows.filter((row) => originOf(row.hostUrl) === currentOrigin)
    if (currentRows.length > 0) setExpanded(new Set(currentRows.map((row) => `${row.hostId}:${row.id}`)))
  }, [currentOrigin, expanded.size, snapshot])

  const rows = useMemo(() => filterWorkspaceRows(snapshot?.rows ?? [], query), [query, snapshot])
  if (!wide) {
    return (
      <div className="dsc-ws-rail">
        <button className="dsc-ws-icon" type="button" aria-label="Show workspaces" title="Workspaces" onClick={expandSidebar}>
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.75 5.25A1.5 1.5 0 0 1 4.25 3.75h4l1.5 1.5h6A1.5 1.5 0 0 1 17.25 6.75v7A1.5 1.5 0 0 1 15.75 15.25H4.25a1.5 1.5 0 0 1-1.5-1.5z" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="dsc-workspaces">
      <header className="dsc-ws-head">
        <span className="dsc-ws-title">Workspaces</span>
        <button className="dsc-ws-icon" type="button" aria-label="Refresh workspaces" title="Refresh" onClick={() => void load(true)}>↻</button>
      </header>
      <input
        className="dsc-ws-search"
        type="search"
        value={query}
        placeholder="Search workspaces"
        aria-label="Search workspaces"
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="dsc-ws-scroll">
        {error !== null && <div className="dsc-ws-error">{error}</div>}
        {snapshot === null && error === null && <div className="dsc-ws-empty">Loading workspaces…</div>}
        {snapshot !== null && rows.length === 0 && <div className="dsc-ws-empty">No matching workspaces</div>}
        {rows.map((row) => {
          const key = `${row.hostId}:${row.id}`
          return (
            <WorkspaceGroup
              key={key}
              row={row}
              expanded={expanded.has(key)}
              currentOrigin={currentOrigin}
              currentSessionId={currentSessionId}
              onToggle={() => setExpanded((current) => {
                const next = new Set(current)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })}
              onConnect={() => { void bridge.connect(row.hostId) }}
              onStartSession={() => startSession(row.id)}
              onOpenSession={open}
            />
          )
        })}
      </div>
    </div>
  )
}

export function registerNativeWorkspaceSidebar(ctx: Context): void {
  const bridge = nativeWorkspaceBridgeOf()
  if (bridge === undefined) return
  const client = ctx as CompanionClientContext
  ctx.effect(installWorkspaceStyles, 'dsh-companion: native workspace sidebar styles')
  client.slots.inject('sidebar.workspaces', () => client.slots.register({
    name: 'sidebar.workspaces',
    priority: SHADOW_PRIORITY,
    inject: () => ({
      bridge,
      startSession: (workspaceId: string | undefined) => client.workspaces.startSession(workspaceId),
      open: (sessionId: string) => client.sessions.open(sessionId),
    }),
  }, NativeWorkspaceSidebar))
}
