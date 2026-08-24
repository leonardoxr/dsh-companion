/**
 * dsh-companion — an out-of-tree DeepSeek Harness plugin.
 *
 * Provides small read-only workspace/session JSON projections and a filtered
 * server-sent-event feed for trusted native shells. Harness objects and raw
 * conversation events never cross the companion boundary.
 * @module dsh-companion
 */
import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
const defaultNotifications = {
    completed: true,
    blocked: true,
    errors: true,
    maxTokens: true,
    aborted: false,
    questions: true,
    approvals: true,
    subagents: false,
};
export const SETTINGS_NAMESPACE = 'companion-notifications';
export const NotificationSettings = z.object({
    completed: z.boolean().default(true).description('Notify when a turn completes successfully.'),
    blocked: z.boolean().default(true).description('Notify when an agent reports that it is blocked.'),
    errors: z.boolean().default(true).description('Notify for failed turns and live agent errors.'),
    maxTokens: z.boolean().default(true).description('Notify when a turn reaches its output-token limit.'),
    aborted: z.boolean().default(false).description('Notify when a turn is cancelled or aborted.'),
    questions: z.boolean().default(true).description('Notify when ask_user_question needs an answer.'),
    approvals: z.boolean().default(true).description('Notify when a tool action needs approval.'),
    subagents: z.boolean().default(false).description('Include alerts from subagent sessions.'),
});
export const Config = z.object({
    notifications: NotificationSettings.default(defaultNotifications).description('Native notification forwarding'),
});
export const name = 'dsh-companion';
export const inject = ['webServer', 'webRuntime', 'apiProxy', 'settings', 'sessions', 'sessionTitle', 'workspaceRegistry'];
const MAX_TITLE = 120;
const MAX_BODY = 320;
const REPLAY_LIMIT = 128;
const HEARTBEAT_MS = 15_000;
const ERROR_COALESCE_MS = 5_000;
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function text(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function bounded(value, limit) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit)
        return normalized;
    return normalized.slice(0, Math.max(0, limit - 1)).trimEnd() + '…';
}
function parseAuthority(authority) {
    try {
        return new URL(`http://${authority}`);
    }
    catch {
        return undefined;
    }
}
function canonicalAuthority(entry, url) {
    const port = url.port !== '' ? url.port : new URL(`https://${entry}`).port;
    return port === '' ? url.hostname : `${url.hostname}:${port}`;
}
function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]')
        return true;
    const parts = hostname.split('.');
    return parts.length === 4
        && parts[0] === '127'
        && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isTrustedRequest(req, trustedHosts) {
    const host = req.headers.host;
    if (host === undefined)
        return false;
    const hostUrl = parseAuthority(host);
    if (hostUrl === undefined)
        return false;
    const trusted = isLoopbackHostname(hostUrl.hostname) || trustedHosts.some(entry => {
        const entryUrl = parseAuthority(entry);
        if (entryUrl === undefined)
            return false;
        return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
            ? entryUrl.hostname === hostUrl.hostname
            : entryUrl.host === hostUrl.host;
    });
    if (!trusted || req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = req.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
function titleAndCwd(ctx, session) {
    return {
        title: ctx.sessionTitle.get(session)?.title ?? null,
        cwd: session.header.cwd ?? null,
    };
}
function sessionLabel(ctx, sessionId) {
    const session = ctx.sessions.get(sessionId);
    const title = session === undefined ? undefined : ctx.sessionTitle.get(session)?.title;
    if (title !== undefined && title.trim() !== '')
        return bounded(title, MAX_TITLE);
    const cwd = session?.header.cwd;
    const folder = cwd?.split(/[\\/]/).filter(Boolean).at(-1);
    return bounded(folder ?? 'DeepSeek Harness', MAX_TITLE);
}
function includesSession(ctx, config, sessionId) {
    return config.subagents || ctx.sessions.get(sessionId)?.header.origin !== 'subagent';
}
function turnNotification(ctx, config, sessionId, event) {
    if (event.type !== 'turn/end')
        return undefined;
    const seq = typeof event.seq === 'number' ? event.seq : undefined;
    const data = record(event.data);
    const reason = record(data?.reason);
    const kind = text(reason?.kind);
    if (seq === undefined || kind === undefined)
        return undefined;
    let notificationKind;
    let body;
    switch (kind) {
        case 'completed':
            if (!config.completed)
                return undefined;
            notificationKind = 'completed';
            body = 'The agent finished its turn.';
            break;
        case 'blocked':
            if (!config.blocked)
                return undefined;
            notificationKind = 'blocked';
            body = 'The agent is blocked and may need your attention.';
            break;
        case 'error': {
            if (!config.errors)
                return undefined;
            notificationKind = 'error';
            const failure = record(reason?.error);
            body = text(failure?.message) ?? 'The agent turn failed.';
            break;
        }
        case 'max-tokens':
            if (!config.maxTokens)
                return undefined;
            notificationKind = 'max-tokens';
            body = 'The agent reached its output-token limit.';
            break;
        case 'aborted':
            if (!config.aborted)
                return undefined;
            notificationKind = 'aborted';
            body = 'The agent turn was cancelled.';
            break;
        default:
            return undefined;
    }
    return {
        version: 1,
        key: `turn:${sessionId}:${seq}`,
        kind: notificationKind,
        sessionId,
        title: sessionLabel(ctx, sessionId),
        body: bounded(body, MAX_BODY),
        at: typeof event.time === 'number' ? event.time : Date.now(),
    };
}
function questionNotification(ctx, envelope) {
    const frame = envelope.payload;
    const sessionId = text(frame.sessionId);
    const questions = Array.isArray(frame.questions) ? frame.questions : [];
    const first = record(questions[0]);
    if (sessionId === undefined || first === undefined)
        return undefined;
    const heading = text(first.header);
    const question = text(first.question) ?? 'The agent has a question.';
    const suffix = questions.length > 1 ? ` (+${questions.length - 1} more)` : '';
    return {
        version: 1,
        key: `question:${envelope.rpcId}`,
        kind: 'question',
        sessionId,
        title: sessionLabel(ctx, sessionId),
        body: bounded(`${heading === undefined ? '' : heading + ': '}${question}${suffix}`, MAX_BODY),
        at: Date.now(),
    };
}
function approvalNotification(ctx, frame) {
    const sessionId = text(frame.sessionId);
    const approvalId = text(frame.approvalId);
    if (sessionId === undefined || approvalId === undefined)
        return undefined;
    const toolName = text(frame.toolName) ?? 'an action';
    const reason = text(frame.reason);
    return {
        version: 1,
        key: `approval:${approvalId}`,
        kind: 'approval',
        sessionId,
        title: sessionLabel(ctx, sessionId),
        body: bounded(reason ?? `Approval required for ${toolName}.`, MAX_BODY),
        at: Date.now(),
    };
}
function encodeSse(event) {
    return `id: ${event.cursor}\nevent: notification\ndata: ${JSON.stringify(event.notification)}\n\n`;
}
function encodeReady(cursor) {
    return `id: ${cursor}\nevent: ready\ndata: {"version":1}\n\n`;
}
export function apply(ctx, config = { notifications: defaultNotifications }) {
    const notificationSettings = ctx.settings.register(SETTINGS_NAMESPACE, NotificationSettings, {
        base: config.notifications ?? defaultNotifications,
    });
    const instanceId = randomUUID();
    const clients = new Set();
    const replay = [];
    const pending = new Map();
    const recentErrors = new Map();
    const streams = new AbortController();
    let counter = 0;
    let disposed = false;
    const currentCursor = () => `${instanceId}:${counter}`;
    const write = (res, chunk) => {
        if (res.destroyed || res.writableEnded) {
            clients.delete(res);
            return;
        }
        try {
            if (!res.write(chunk)) {
                clients.delete(res);
                res.end();
            }
        }
        catch {
            clients.delete(res);
        }
    };
    const publish = (notification) => {
        const item = {
            counter: ++counter,
            cursor: currentCursor(),
            notification,
        };
        replay.push(item);
        if (replay.length > REPLAY_LIMIT)
            replay.shift();
        const encoded = encodeSse(item);
        for (const client of clients)
            write(client, encoded);
    };
    const isPairedError = (sessionId, source) => {
        const now = Date.now();
        for (const [id, seen] of recentErrors) {
            const active = seen.filter(item => now - item.at < ERROR_COALESCE_MS);
            if (active.length === 0)
                recentErrors.delete(id);
            else
                recentErrors.set(id, active);
        }
        const seen = recentErrors.get(sessionId) ?? [];
        const pair = seen.findIndex(item => item.source !== source);
        if (pair >= 0) {
            seen.splice(pair, 1);
            if (seen.length === 0)
                recentErrors.delete(sessionId);
            else
                recentErrors.set(sessionId, seen);
            return true;
        }
        seen.push({ at: now, source });
        recentErrors.set(sessionId, seen);
        return false;
    };
    const send = (res, status, body) => {
        res.writeHead(status, {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
        });
        res.end(JSON.stringify(body));
    };
    function rejectUntrusted(req, res) {
        if (isTrustedRequest(req, ctx.webRuntime.trustedHosts))
            return false;
        send(res, 403, { error: 'untrusted request authority' });
        return true;
    }
    function rejectNonGet(req, res) {
        if (req.method === 'GET')
            return false;
        send(res, 405, { error: 'method not allowed' });
        return true;
    }
    const disposers = [
        ctx.webServer.register({
            kind: 'exact',
            path: '/api/companion/workspaces',
            handler(req, res) {
                if (rejectUntrusted(req, res) || rejectNonGet(req, res))
                    return;
                const workspaces = ctx.workspaceRegistry.list().map(workspace => ({
                    id: workspace.id,
                    path: workspace.path,
                    title: workspace.title,
                    createdAt: workspace.createdAt,
                    updatedAt: workspace.updatedAt,
                    sessionIds: [...workspace.sessionIds],
                }));
                send(res, 200, { workspaces });
            },
        }),
        ctx.webServer.register({
            kind: 'exact',
            path: '/api/companion/sessions',
            async handler(req, res) {
                if (rejectUntrusted(req, res) || rejectNonGet(req, res))
                    return;
                const live = new Map(ctx.sessions.list().map(session => [session.id, {
                        id: session.id,
                        ...titleAndCwd(ctx, session),
                        createdAt: session.header.createdAt,
                        updatedAt: session.header.createdAt,
                    }]));
                try {
                    const response = await ctx.apiProxy.sessions.list({ rpcId: randomUUID(), payload: {} });
                    const sessions = response.payload.items.map(summary => {
                        const current = live.get(summary.sessionId);
                        return {
                            id: summary.sessionId,
                            title: current?.title ?? null,
                            cwd: current?.cwd ?? summary.cwd ?? null,
                            createdAt: current?.createdAt ?? summary.updatedAt,
                            updatedAt: summary.updatedAt,
                        };
                    });
                    send(res, 200, { sessions });
                }
                catch (error) {
                    ctx.logger?.warn('dsh-companion: persisted session listing failed', error);
                    send(res, 200, { sessions: [...live.values()] });
                }
            },
        }),
        ctx.webServer.register({
            kind: 'prefix',
            path: '/api/companion/session',
            handler(req, res) {
                if (rejectUntrusted(req, res) || rejectNonGet(req, res))
                    return;
                const url = new URL(req.url ?? '/', 'http://localhost');
                const id = url.pathname.slice('/api/companion/session/'.length);
                const session = ctx.sessions.get(id);
                if (session === undefined) {
                    send(res, 404, { error: `no live session '${id}'` });
                    return;
                }
                send(res, 200, {
                    id: session.id,
                    ...titleAndCwd(ctx, session),
                    createdAt: session.header.createdAt,
                    seq: session.seq,
                    parentSession: session.header.parentSession ?? null,
                    origin: session.header.origin ?? null,
                });
            },
        }),
        ctx.webServer.register({
            kind: 'exact',
            path: '/api/companion/notifications',
            handler(req, res) {
                if (rejectUntrusted(req, res) || rejectNonGet(req, res))
                    return;
                res.writeHead(200, {
                    'cache-control': 'no-store',
                    connection: 'keep-alive',
                    'content-type': 'text/event-stream; charset=utf-8',
                    'x-accel-buffering': 'no',
                });
                res.flushHeaders?.();
                clients.add(res);
                const removeClient = () => clients.delete(res);
                res.once('close', removeClient);
                req.once('aborted', removeClient);
                const url = new URL(req.url ?? '/', 'http://localhost');
                const requestedCursor = url.searchParams.get('since') ?? req.headers['last-event-id'];
                const cursor = Array.isArray(requestedCursor) ? requestedCursor[0] : requestedCursor;
                const separator = cursor?.lastIndexOf(':') ?? -1;
                const cursorInstance = separator < 0 ? undefined : cursor?.slice(0, separator);
                const cursorCounter = separator < 0 ? undefined : Number(cursor?.slice(separator + 1));
                const oldestCounter = replay[0]?.counter ?? counter + 1;
                const canReplay = cursorInstance === instanceId
                    && Number.isSafeInteger(cursorCounter)
                    && cursorCounter >= oldestCounter - 1
                    && cursorCounter <= counter;
                const replayedPending = new Set();
                if (canReplay) {
                    for (const item of replay) {
                        if (item.counter <= cursorCounter)
                            continue;
                        if (item.notification.kind === 'question' || item.notification.kind === 'approval') {
                            if (!pending.has(item.notification.key))
                                continue;
                            replayedPending.add(item.notification.key);
                        }
                        write(res, encodeSse(item));
                    }
                }
                else {
                    write(res, encodeReady(currentCursor()));
                }
                for (const notification of pending.values()) {
                    if (replayedPending.has(notification.key))
                        continue;
                    write(res, `event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
                }
            },
        }),
    ];
    const heartbeat = setInterval(() => {
        for (const client of clients)
            write(client, ': heartbeat\n\n');
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
    const handleMux = (envelope) => {
        const frame = envelope.payload;
        const notificationConfig = notificationSettings.get();
        const sessionId = text(frame.sessionId);
        if (sessionId !== undefined && !includesSession(ctx, notificationConfig, sessionId))
            return;
        if (frame.type === 'session/event' && sessionId !== undefined) {
            const event = record(frame.event);
            if (event !== undefined) {
                const notification = turnNotification(ctx, notificationConfig, sessionId, event);
                if (notification?.kind === 'error' && isPairedError(sessionId, 'turn'))
                    return;
                if (notification !== undefined)
                    publish(notification);
            }
            return;
        }
        if (frame.type === 'question/requested' && notificationConfig.questions) {
            const notification = questionNotification(ctx, envelope);
            if (notification !== undefined) {
                pending.set(notification.key, notification);
                publish(notification);
            }
            return;
        }
        if (frame.type === 'question/resolved') {
            const rpcId = text(frame.questionRpcId);
            if (rpcId !== undefined)
                pending.delete(`question:${rpcId}`);
            return;
        }
        if (frame.type === 'approval/requested' && notificationConfig.approvals) {
            const notification = approvalNotification(ctx, frame);
            if (notification !== undefined) {
                pending.set(notification.key, notification);
                publish(notification);
            }
            return;
        }
        if (frame.type === 'approval/resolved') {
            const approvalId = text(frame.approvalId);
            if (approvalId !== undefined)
                pending.delete(`approval:${approvalId}`);
        }
    };
    const handleHost = (envelope) => {
        const notificationConfig = notificationSettings.get();
        const frame = envelope.payload;
        if (frame.type !== 'host/agent-error' || !notificationConfig.errors)
            return;
        const sessionId = text(frame.sessionId);
        if (sessionId === undefined || !includesSession(ctx, notificationConfig, sessionId))
            return;
        const body = bounded(text(frame.message) ?? 'The agent reported an error.', MAX_BODY);
        if (isPairedError(sessionId, 'host'))
            return;
        publish({
            version: 1,
            key: `agent-error:${envelope.rpcId}`,
            kind: 'error',
            sessionId,
            title: sessionLabel(ctx, sessionId),
            body,
            at: Date.now(),
        });
    };
    const pump = async (label, source, handler) => {
        try {
            for await (const envelope of source)
                handler(envelope);
            if (!streams.signal.aborted)
                ctx.logger?.warn(`dsh-companion: ${label} notification stream ended unexpectedly`);
        }
        catch (error) {
            if (!streams.signal.aborted)
                ctx.logger?.warn(`dsh-companion: ${label} notification stream failed`, error);
        }
    };
    void pump('session', ctx.apiProxy.events.mux({ rpcId: randomUUID(), payload: {} }, streams.signal), handleMux);
    void pump('host', ctx.apiProxy.events.host({ rpcId: randomUUID(), payload: {} }, streams.signal), handleHost);
    return () => {
        if (disposed)
            return;
        disposed = true;
        streams.abort();
        clearInterval(heartbeat);
        for (const client of clients)
            client.end();
        clients.clear();
        for (const dispose of disposers)
            dispose();
    };
}
//# sourceMappingURL=index.js.map