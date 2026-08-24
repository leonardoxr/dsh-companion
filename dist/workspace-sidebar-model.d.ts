export interface NativeWorkspaceSession {
    id: string;
    title: string;
    cwd: string | null;
    updatedAt: number;
}
export interface NativeWorkspaceRow {
    kind: 'workspace';
    hostId: string;
    hostName: string;
    hostUrl: string;
    hostLocal: boolean;
    id: string;
    title: string;
    path: string;
    updatedAt: number;
    totalSessions: number;
    liveSessions: number | null;
    sessions: NativeWorkspaceSession[] | null;
    stale?: boolean;
}
export interface NativeWorkspaceServer {
    id: string;
    name: string;
    url: string;
    local: boolean;
    status: 'loading' | 'online' | 'unavailable' | 'cache';
}
export interface NativeWorkspaceSnapshot {
    generatedAt: number;
    servers: Record<string, NativeWorkspaceServer>;
    rows: NativeWorkspaceRow[];
}
export interface NativeWorkspaceBridge {
    getSnapshot(): Promise<NativeWorkspaceSnapshot>;
    refresh(): Promise<NativeWorkspaceSnapshot>;
    connect(hostId: string): Promise<void>;
}
export declare function isNativeWorkspaceBridge(value: unknown): value is NativeWorkspaceBridge;
export declare function originOf(value: string): string | null;
export declare function filterWorkspaceRows(rows: readonly NativeWorkspaceRow[], query: string): NativeWorkspaceRow[];
export declare function sessionCountLabel(row: NativeWorkspaceRow): string;
