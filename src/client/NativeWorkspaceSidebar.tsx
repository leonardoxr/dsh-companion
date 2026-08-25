import { useCallback, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import {
  isNativeWorkspaceBridge,
  mergedSessionList,
  mergedWorkspaceList,
  parseRemoteId,
  type WorkspaceListStateCore,
  type NativeWorkspaceBridge,
  type NativeWorkspaceSnapshot,
} from '../workspace-sidebar-model.js'
import { createWorkspaceViewStore, WorkspaceBrowser } from './vendor/workspace-browser.js'

interface SlotRegistryFace {
  entries(hole: string): readonly unknown[]
  subscribe(hole: string, listener: () => void): () => void
  register(options: Record<string, unknown>, component: unknown): unknown
  inject(hole: string, factory: () => () => void): void
}

type CompanionClientContext = Context & {
  get(name: string): Record<string, unknown> | undefined
  slots: SlotRegistryFace
  sessions: {
    open(sessionId: string): void
    fork(input: { sessionId: string; increaseTitle?: boolean }): Promise<string>
    search(query: string, signal: AbortSignal): Promise<{ ok: boolean; value?: { items: unknown[]; hasMore: boolean }; error?: { message: string } }>
    searchResultLimit: number
    binding(sessionId: string): { session: { rename(title: string): Promise<{ ok: boolean; error?: { message: string } }> } } | undefined
  }
  workspaces: {
    startSession(workspaceId?: string): void
    rename(workspaceId: string, title: string): Promise<unknown>
    delete(workspaceId: string): Promise<unknown>
    insertBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<unknown>
    archiveSession(sessionId: string): Promise<unknown>
    insertSessionBefore(workspaceId: string, sessionId: string, beforeSessionId?: string): Promise<unknown>
    create(input: { path: string }): Promise<unknown>
  }
}

export interface InjectedFace {
  bridge: NativeWorkspaceBridge
  startSession(workspaceId?: string): void
  open(sessionId: string): void
  searchSessions(query: string, signal: AbortSignal): Promise<{ items: unknown[]; hasMore: boolean }>
  searchResultLimit: number
  renameSession(sessionId: string, title: string): Promise<void>
  forkSession(sessionId: string): void
  renameWorkspace(workspaceId: string, title: string): Promise<void>
  deleteWorkspace(workspaceId: string): Promise<void>
  insertWorkspaceBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<void>
  archiveSession(sessionId: string): Promise<void>
  insertSessionBefore(workspaceId: string, sessionId: string, beforeSessionId?: string): Promise<void>
  createWorkspace(input: { path: string }): Promise<unknown>
  hooks: {
    directoryFlow: { getSnapshot(): boolean; subscribe(listener: () => void): () => void }
    hostDescription: unknown
  }
}

type NativeWorkspaceSidebarProps = {
  wide: boolean
  expandSidebar(): void
  useSessions<S>(selector: (state: SessionListState) => S): S
  useWorkspaces<S>(selector: (state: unknown) => S): S
} & InjectedFace & Record<string, unknown>

declare global {
  interface Window {
    dshNativeWorkspaces?: unknown
  }
}

export function nativeWorkspaceBridgeOf(value: unknown = window.dshNativeWorkspaces): NativeWorkspaceBridge | undefined {
  return isNativeWorkspaceBridge(value) ? value : undefined
}

const REFRESH_INTERVAL_MS = 60_000

/**
 * The sidebar region rendered by the STOCK WorkspaceBrowser, vendored verbatim
 * from @deepseek-ai/dsh-client-ui-workspace so the result stays pixel-identical
 * to an ordinary browser session. Cross-server workspaces enter through the
 * same two framework hooks the component already consumes: this wrapper merges
 * the Companion snapshot into the session/workspace states under synthetic
 * remote:<hostId>:<id> ids, and intercepts the few row actions that would
 * otherwise mutate another computer — those navigate DSH Native to that server.
 */
export function NativeWorkspaceSidebar(props: NativeWorkspaceSidebarProps) {
  const {
    bridge,
    useSessions: useLocalSessions,
    useWorkspaces: useLocalWorkspaces,
    startSession,
    open,
    ...rest
  } = props
  const currentOrigin = window.location.origin

  const [snapshot, setSnapshot] = useState<NativeWorkspaceSnapshot | null>(null)
  const snapshotRef = useRef<NativeWorkspaceSnapshot | null>(null)
  snapshotRef.current = snapshot

  const load = useCallback(async (refresh: boolean) => {
    try {
      const next = refresh ? await bridge.refresh() : await bridge.getSnapshot()
      setSnapshot(next)
    } catch (cause) {
      // Without an aggregate (bridge rejected — e.g. this page origin is not a
      // saved server in DSH Native) the sidebar degrades to the plain local
      // browser, which is exactly what ordinary pages should show.
      console.warn('[dsh-companion] native workspace snapshot unavailable:', cause instanceof Error ? cause.message : cause)
    }
  }, [bridge])

  useEffect(() => {
    void load(false).then(() => load(true))
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  // Merge caches: the selector hooks demand referential stability between
  // store notifications, so rebuilt states are keyed on their exact inputs.
  const sessionsCache = useRef<{
    src: SessionListState | null
    snap: NativeWorkspaceSnapshot | null
    out: SessionListState | null
  } | null>(null)
  const mergedSessions = useCallback((local: SessionListState): SessionListState => {
    const cached = sessionsCache.current
    if (cached !== null && cached.src === local && cached.snap === snapshotRef.current && cached.out !== null) {
      return cached.out
    }
    const out = mergedSessionList(local, snapshotRef.current, currentOrigin)
    sessionsCache.current = { src: local, snap: snapshotRef.current, out }
    return out
  }, [currentOrigin])

  const workspacesCache = useRef<{ src: unknown; snap: NativeWorkspaceSnapshot | null; out: unknown } | null>(null)
  const mergedWorkspaces = useCallback((local: unknown): unknown => {
    const cached = workspacesCache.current
    if (cached !== null && cached.src === local && cached.snap === snapshotRef.current && cached.out !== null) {
      return cached.out
    }
    const out = mergedWorkspaceList(local as WorkspaceListStateCore, snapshotRef.current, currentOrigin)
    workspacesCache.current = { src: local, snap: snapshotRef.current, out }
    return out
  }, [currentOrigin])

  const useMergedSessions = useCallback(<S,>(selector: (state: SessionListState) => S): S =>
    useLocalSessions((local: SessionListState) => selector(mergedSessions(local))), [mergedSessions, useLocalSessions])
  const useMergedWorkspaces = useCallback(<S,>(selector: (state: unknown) => S): S =>
    useLocalWorkspaces((local: unknown) => selector(mergedWorkspaces(local))), [mergedWorkspaces, useLocalWorkspaces])

  // Remote-aware navigation actions.
  const wrappedStartSession = useCallback((workspaceId?: string) => {
    const remote = workspaceId === undefined ? undefined : parseRemoteId(workspaceId)
    if (remote) void bridge.connect(remote.hostId)
    else startSession(workspaceId)
  }, [bridge, startSession])

  const wrappedOpen = useCallback((sessionId: string) => {
    const remote = parseRemoteId(sessionId)
    if (remote) void bridge.connect(remote.hostId)
    else open(sessionId)
  }, [bridge, open])

  return <WorkspaceBrowser
    {...rest}
    useSessions={useMergedSessions}
    useWorkspaces={useMergedWorkspaces}
    startSession={wrappedStartSession}
    open={wrappedOpen}
  />
}

export function registerNativeWorkspaceSidebar(ctx: Context): void {
  ctx.effect(() => {
    const bridge = nativeWorkspaceBridgeOf()
    if (bridge === undefined) return () => {}
    const client = ctx as CompanionClientContext

    // Same occupancy source the stock registration uses for its child hole, so
    // the composed directory-picker keeps filling the Add workspace flow.
    const flowSource = (hole: string) => ({
      getSnapshot: () => client.slots.entries(hole).length > 0,
      subscribe: (listener: () => void) => client.slots.subscribe(hole, listener),
    })
    const browserFlowSource = flowSource('sidebar.workspaces.directoryFlow')
    let hostDescription: unknown
    try {
      hostDescription = client.get('connection')?.hostDescription
    } catch {
      hostDescription = undefined
    }

    const browserInjected = (): InjectedFace => ({
      bridge,
      startSession: (workspaceId) => {
        client.workspaces.startSession(workspaceId)
      },
      open: (sessionId) => {
        client.sessions.open(sessionId)
      },
      searchSessions: async (query, signal) => {
        const result = await client.sessions.search(query, signal)
        if (!result.ok) throw new Error(result.error?.message ?? 'session search failed')
        return result.value as { items: unknown[]; hasMore: boolean }
      },
      searchResultLimit: client.sessions.searchResultLimit,
      renameSession: async (sessionId, title) => {
        const binding = client.sessions.binding(sessionId)
        const session = binding?.session
        if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
        const result = await session.rename(title)
        if (!result.ok) throw new Error(result.error?.message ?? 'rename failed')
      },
      forkSession: (sessionId) => {
        client.sessions.fork({ sessionId, increaseTitle: true }).then((childId) => {
          client.sessions.open(childId)
        }).catch(() => {})
      },
      renameWorkspace: async (workspaceId, title) => {
        await client.workspaces.rename(workspaceId, title)
      },
      deleteWorkspace: async (workspaceId) => {
        await client.workspaces.delete(workspaceId)
      },
      insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
        await client.workspaces.insertBefore(workspaceId, beforeWorkspaceId)
      },
      archiveSession: async (sessionId) => {
        await client.workspaces.archiveSession(sessionId)
      },
      insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
        await client.workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
      },
      createWorkspace: (input) => client.workspaces.create(input),
      hooks: {
        directoryFlow: browserFlowSource,
        hostDescription,
      },
    })

    // Reuse the stock directoryFlow declaration; duplicate child declarations
    // are rejected when the native bridge is present alongside ui-workspace.
    ctx.slots.inject('sidebar.workspaces', () => client.slots.register({
      name: 'sidebar.workspaces',
      store: createWorkspaceViewStore(),
      inject: browserInjected,
      priority: -1,
      locale: 'workspace',
    }, NativeWorkspaceSidebar as never))
    return () => {}
  }, 'dsh-companion: native workspace sidebar')
}
