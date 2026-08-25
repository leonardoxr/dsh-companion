/**
 * Data model for the native cross-server workspace sidebar.
 *
 * The stock WorkspaceBrowser renders exclusively from the framework's
 * global `useWorkspaces` / `useSessions` selector hooks. This module merges
 * Companion's cross-server snapshot into those shapes under a
 * `remote:<hostId>:<id>` id scheme, so the stock component renders other
 * computers' workspaces as first-class rows with zero visual divergence.
 */
/** Structural guard for the DSH Native preload bridge. */
export function isNativeWorkspaceBridge(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const candidate = value;
    return typeof candidate.getSnapshot === 'function'
        && typeof candidate.refresh === 'function'
        && typeof candidate.connect === 'function';
}
export function originOf(value) {
    try {
        return new URL(value).origin;
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Remote id scheme
// ---------------------------------------------------------------------------
export const REMOTE_PREFIX = 'remote:';
/** Synthetic id for a remote workspace or session row. */
export function remoteId(hostId, id) {
    return `${REMOTE_PREFIX}${hostId}:${id}`;
}
/** Split a synthetic remote id back into its host and native halves. */
export function parseRemoteId(id) {
    if (!id.startsWith(REMOTE_PREFIX))
        return undefined;
    const rest = id.slice(REMOTE_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep <= 0 || sep === rest.length - 1)
        return undefined;
    return { hostId: rest.slice(0, sep), id: rest.slice(sep + 1) };
}
/**
 * Rows contributed by the server the page already runs on are dropped: that
 * server is rendered natively by the live runtime hooks, and duplicating it
 * would list every local workspace twice.
 */
export function externalRows(snapshot, currentOrigin) {
    if (snapshot === null)
        return [];
    return snapshot.rows.filter((row) => {
        const rowOrigin = originOf(row.hostUrl);
        return rowOrigin !== null && rowOrigin !== currentOrigin;
    });
}
function iso(epoch) {
    return new Date(epoch).toISOString();
}
/**
 * Synthetic WorkspaceView rows for every workspace owned by another saved
 * server, most-recent-first as delivered by the aggregator. Titles carry the
 * owning server name so rows stay distinguishable inside one list; everything
 * else matches the wire projection field-for-field.
 */
export function remoteWorkspaceViews(snapshot, currentOrigin) {
    return externalRows(snapshot, currentOrigin).map((row) => ({
        workspaceId: remoteId(row.hostId, row.id),
        path: row.path,
        title: `${row.title} · ${row.hostName}`,
        sessionIds: (row.sessions ?? []).map((session) => remoteId(row.hostId, session.id)),
        createdAt: iso(row.updatedAt),
        updatedAt: iso(row.updatedAt),
    }));
}
/**
 * Synthetic SessionSummary rows for sessions of external servers, including
 * orphans (sessions no workspace claims — the stock browser files them under
 * Ungrouped exactly like local orphans).
 */
export function remoteSessionSummaries(snapshot, currentOrigin) {
    if (snapshot === null)
        return [];
    const summaries = [];
    const push = (hostId, session) => {
        summaries.push({
            id: remoteId(hostId, session.id),
            displayTitle: session.title,
            cwd: session.cwd ?? undefined,
            running: false,
            blank: false,
            updatedAt: session.updatedAt,
        });
    };
    for (const row of externalRows(snapshot, currentOrigin)) {
        for (const session of row.sessions ?? [])
            push(row.hostId, session);
    }
    for (const orphan of snapshot.orphanSessions ?? []) {
        const orphanOrigin = originOf(orphan.hostUrl);
        if (orphanOrigin === null || orphanOrigin === currentOrigin)
            continue;
        push(orphan.hostId, orphan);
    }
    return summaries;
}
/**
 * Local session list plus every external-server session as synthetic rows.
 * Returns the input unchanged when there is nothing to add, so callers keep
 * referential stability across purely local updates.
 */
export function mergedSessionList(local, snapshot, currentOrigin) {
    const extra = remoteSessionSummaries(snapshot, currentOrigin);
    if (extra.length === 0)
        return local;
    const byId = { ...local.byId };
    const ids = [...local.ids];
    for (const summary of extra) {
        if (byId[summary.id] !== undefined)
            continue;
        byId[summary.id] = summary;
        ids.push(summary.id);
    }
    return { ...local, ids, byId };
}
/**
 * Local workspace list plus one synthetic view per external workspace.
 * Remote groups append after the local durable order so "other computers"
 * reads as a contiguous tail of the same list.
 */
export function mergedWorkspaceList(local, snapshot, currentOrigin) {
    const views = remoteWorkspaceViews(snapshot, currentOrigin);
    if (views.length === 0)
        return local;
    const known = new Set(local.items.map((item) => item.workspaceId));
    const additions = views.filter((view) => !known.has(view.workspaceId));
    if (additions.length === 0)
        return local;
    return { ...local, items: [...local.items, ...additions] };
}
//# sourceMappingURL=workspace-sidebar-model.js.map