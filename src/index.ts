/**
 * dsh-companion — an out-of-tree DeepSeek Harness plugin.
 *
 * Registers read-only JSON routes on the harness webserver so a native client
 * shell (for example the dsh-native Electron app) can render workspaces and
 * sessions without booting the full web UI:
 *
 *   GET /api/companion/workspaces        → { workspaces: [...] }
 *   GET /api/companion/sessions          → { sessions: [...] }
 *   GET /api/companion/session/<id>      → summary or 404
 *
 * The plugin ships as a dsh bundle (see README.md): install it into a
 * profile with `dsh plugin --profile <name> add`. It
 * imports nothing at runtime from the harness: every capability arrives
 * through injected Cordis services, and the node:http types below are
 * type-only. Unloading the plugin removes its routes.
 * @module dsh-companion
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Handler shape the harness webserver accepts. */
type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/** Minimal structural view of the webserver service this plugin consumes. */
interface WebServerLike {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: RouteHandler }): () => void
}

/** Session header facts this plugin projects. */
interface SessionHeaderLike {
  createdAt: number
  cwd?: string
  parentSession?: string
  origin?: 'subagent'
}

/** Minimal structural view of a harness session. */
interface SessionLike {
  id: string
  header: SessionHeaderLike
  seq: number
}

/** Minimal structural view of the services this plugin consumes. */
interface CompanionContext {
  webServer: WebServerLike
  webRuntime: {
    trustedHosts: readonly string[]
  }
  sessions: {
    list(): SessionLike[]
    get(id: string): SessionLike | undefined
  }
  sessionTitle: {
    get(session: unknown): { title: string } | undefined
  }
  workspaceRegistry: {
    list(): Array<{
      id: string
      path: string
      title: string
      createdAt: string
      updatedAt: string
      sessionIds: readonly string[]
    }>
  }
}

/** Cordis plugin name. */
export const name = 'dsh-companion'

/** Services required before apply runs. */
export const inject = ['webServer', 'webRuntime', 'sessions', 'sessionTitle', 'workspaceRegistry'] as const

/** One live-session row in the JSON projection. */
interface SessionRow {
  id: string
  title: string | null
  cwd: string | null
  createdAt: number
}

/** Normalized URL for a Host-header authority, or undefined when invalid. */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Canonical host or host:port form, preserving an explicitly configured port. */
function canonicalAuthority(entry: string, url: URL): string {
  const port = url.port !== '' ? url.port : new URL(`https://${entry}`).port
  return port === '' ? url.hostname : `${url.hostname}:${port}`
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Match DSH's trusted-host policy for API requests without importing host internals. */
function isTrustedRequest(req: IncomingMessage, trustedHosts: readonly string[]): boolean {
  const host = req.headers.host
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false

  const trusted = isLoopbackHostname(hostUrl.hostname) || trustedHosts.some(entry => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
  if (!trusted || req.headers['sec-fetch-site'] === 'cross-site') return false

  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Shared nullable fields of a session row. */
function titleAndCwd(ctx: CompanionContext, session: { header: SessionHeaderLike }): { title: string | null; cwd: string | null } {
  return {
    title: ctx.sessionTitle.get(session)?.title ?? null,
    cwd: session.header.cwd ?? null,
  }
}

/**
 * Plugin entry point. Registers the three companion routes and returns their
 * combined disposer, so unloading withdraws every route together.
 * @param ctx - Cordis context carrying the injected host services.
 * @returns disposer removing all registered routes.
 */
export function apply(ctx: CompanionContext): () => void {
  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, {
      'cache-control': 'no-store',
      'content-type': 'application/json',
    })
    res.end(JSON.stringify(body))
  }

  /** Reject requests outside the web runtime's trusted-host boundary. */
  function rejectUntrusted(req: IncomingMessage, res: ServerResponse): boolean {
    if (isTrustedRequest(req, ctx.webRuntime.trustedHosts)) return false
    send(res, 403, { error: 'untrusted request authority' })
    return true
  }

  /** Answer non-GET requests; returns true when the response was handled. */
  function rejectNonGet(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.method === 'GET') return false
    send(res, 405, { error: 'method not allowed' })
    return true
  }

  const disposers = [
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/companion/workspaces',
      handler(req, res) {
        if (rejectUntrusted(req, res)) return
        if (rejectNonGet(req, res)) return
        // Pick fields explicitly: registry entities carry non-JSON internals.
        const workspaces = ctx.workspaceRegistry.list().map(workspace => ({
          id: workspace.id,
          path: workspace.path,
          title: workspace.title,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          sessionIds: [...workspace.sessionIds],
        }))
        send(res, 200, { workspaces })
      },
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: '/api/companion/sessions',
      handler(req, res) {
        if (rejectUntrusted(req, res)) return
        if (rejectNonGet(req, res)) return
        const sessions: SessionRow[] = ctx.sessions.list().map(session => ({
          id: session.id,
          ...titleAndCwd(ctx, session),
          createdAt: session.header.createdAt,
        }))
        send(res, 200, { sessions })
      },
    }),

    ctx.webServer.register({
      kind: 'prefix',
      path: '/api/companion/session',
      handler(req, res) {
        if (rejectUntrusted(req, res)) return
        if (rejectNonGet(req, res)) return
        const url = new URL(req.url ?? '/', 'http://localhost')
        const id = url.pathname.slice('/api/companion/session/'.length)
        const session = ctx.sessions.get(id)
        if (session === undefined) {
          send(res, 404, { error: `no live session '${id}'` })
          return
        }
        send(res, 200, {
          id: session.id,
          ...titleAndCwd(ctx, session),
          createdAt: session.header.createdAt,
          seq: session.seq,
          parentSession: session.header.parentSession ?? null,
          origin: session.header.origin ?? null,
        })
      },
    }),
  ]

  return () => {
    for (const dispose of disposers) dispose()
  }
}
