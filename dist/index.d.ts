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
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Handler shape the harness webserver accepts. */
type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
/** Minimal structural view of the webserver service this plugin consumes. */
interface WebServerLike {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: RouteHandler;
    }): () => void;
}
/** Session header facts this plugin projects. */
interface SessionHeaderLike {
    createdAt: number;
    cwd?: string;
    parentSession?: string;
    origin?: 'subagent';
}
/** Minimal structural view of a harness session. */
interface SessionLike {
    id: string;
    header: SessionHeaderLike;
    seq: number;
}
/** Minimal structural view of the services this plugin consumes. */
interface CompanionContext {
    webServer: WebServerLike;
    webRuntime: {
        trustedHosts: readonly string[];
    };
    sessions: {
        list(): SessionLike[];
        get(id: string): SessionLike | undefined;
    };
    sessionTitle: {
        get(session: unknown): {
            title: string;
        } | undefined;
    };
    workspaceRegistry: {
        list(): Array<{
            id: string;
            path: string;
            title: string;
            createdAt: string;
            updatedAt: string;
            sessionIds: readonly string[];
        }>;
    };
}
/** Cordis plugin name. */
export declare const name = "dsh-companion";
/** Services required before apply runs. */
export declare const inject: readonly ['webServer', 'webRuntime', 'sessions', 'sessionTitle', 'workspaceRegistry'];
/**
 * Plugin entry point. Registers the three companion routes and returns their
 * combined disposer, so unloading withdraws every route together.
 * @param ctx - Cordis context carrying the injected host services.
 * @returns disposer removing all registered routes.
 */
export declare function apply(ctx: CompanionContext): () => void;
export {};
