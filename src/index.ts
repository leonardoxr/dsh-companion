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
 * The plugin is loaded through a cordis.yml patch (see README.md). It imports
 * nothing at runtime from the harness: every capability arrives through the
 * injected Cordis services, and the node:http types below are type-only.
 * Unloading the plugin removes its routes.
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
export const inject = ['webServer', 'sessions', 'sessionTitle', 'workspaceRegistry'] as const

/** One live-session row in the JSON projection. */
interface SessionRow {
  id: string
  title: string | null
  cwd: string | null
  createdAt: number
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
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
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
      handler(_req, res) {
        // Copy out of the registry's live arrays so serialization sees plain JSON.
        const workspaces = ctx.workspaceRegistry.list().map(workspace => ({
          ...workspace,
          sessionIds: [...workspace.sessionIds],
        }))
        send(res, 200, { workspaces })
      },
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: '/api/companion/sessions',
      handler(_req, res) {
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
      path: '/api/companion/session/',
      handler(req, res) {
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
