/**
 * dsh-companion — an out-of-tree DeepSeek Harness plugin.
 *
 * Provides small read-only workspace/session JSON projections and a filtered
 * server-sent-event feed for trusted native shells. Harness objects and raw
 * conversation events never cross the companion boundary.
 * @module dsh-companion
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import z from '@deepseek-ai/schemastery';
type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
interface WebServerLike {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: RouteHandler;
    }): () => void;
}
interface SessionHeaderLike {
    createdAt: number;
    cwd?: string;
    parentSession?: string;
    origin?: 'subagent';
}
interface SessionLike {
    id: string;
    header: SessionHeaderLike;
    seq: number;
}
interface ApiFrame {
    type: string;
    [key: string]: unknown;
}
interface RpcEnvelope {
    rpcId: string;
    payload: ApiFrame;
}
interface EventStreamsLike {
    mux(request: {
        rpcId: string;
        payload: Record<string, never>;
    }, signal: AbortSignal): AsyncIterable<RpcEnvelope>;
    host(request: {
        rpcId: string;
        payload: Record<string, never>;
    }, signal: AbortSignal): AsyncIterable<RpcEnvelope>;
}
interface SessionSummaryLike {
    sessionId: string;
    updatedAt: number;
    cwd?: string;
}
interface SessionApiLike {
    list(request: {
        rpcId: string;
        payload: Record<string, never>;
    }): Promise<{
        rpcId: string;
        payload: {
            items: SessionSummaryLike[];
        };
    }>;
}
interface CompanionContext {
    webServer: WebServerLike;
    webRuntime: {
        trustedHosts: readonly string[];
    };
    apiProxy: {
        events: EventStreamsLike;
        sessions: SessionApiLike;
    };
    settings: {
        register<T>(namespace: string, schema: z<T>, options: {
            base: T;
        }): {
            get(): T;
        };
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
    logger?: {
        warn(message: string, ...args: unknown[]): void;
    };
}
export interface NotificationConfig {
    completed: boolean;
    blocked: boolean;
    errors: boolean;
    maxTokens: boolean;
    aborted: boolean;
    questions: boolean;
    approvals: boolean;
    subagents: boolean;
}
export interface Config {
    notifications: NotificationConfig;
}
export declare const SETTINGS_NAMESPACE = "companion-notifications";
export declare const NotificationSettings: z<NotificationConfig>;
export declare const Config: z<Config>;
export declare const name = "dsh-companion";
export declare const inject: readonly ['webServer', 'webRuntime', 'apiProxy', 'settings', 'sessions', 'sessionTitle', 'workspaceRegistry'];
export type NotificationKind = 'completed' | 'blocked' | 'error' | 'max-tokens' | 'aborted' | 'question' | 'approval';
export interface CompanionNotification {
    version: 1;
    key: string;
    kind: NotificationKind;
    sessionId: string;
    title: string;
    body: string;
    at: number;
}
export declare function apply(ctx: CompanionContext, config?: Config): () => void;
export {};
