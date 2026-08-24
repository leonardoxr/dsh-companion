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
export function filterWorkspaceRows(rows, query) {
    const needle = query.trim().toLocaleLowerCase();
    if (needle === '')
        return [...rows];
    return rows.filter((row) => [
        row.title,
        row.path,
        row.hostName,
        row.hostUrl,
        ...(row.sessions ?? []).map((session) => session.title),
    ].some((value) => value.toLocaleLowerCase().includes(needle)));
}
export function sessionCountLabel(row) {
    if (row.liveSessions !== null && row.liveSessions !== row.totalSessions) {
        return `${row.liveSessions} of ${row.totalSessions}`;
    }
    return String(row.totalSessions);
}
//# sourceMappingURL=workspace-sidebar-model.js.map