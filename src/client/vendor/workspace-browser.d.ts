// Type shim for the vendored @deepseek-ai/dsh-client-ui-workspace bundle.
// The vendor file is compiled JavaScript copied verbatim from the installed
// distribution; its internals are intentionally typed loosely here while the
// consuming side (NativeWorkspaceSidebar) constructs props against the real
// contracts from @deepseek-ai/dsh-client-ui-workspace types.
import type { ComponentType } from 'react';

/** The stock sidebar browsing region component (section header, tree, dialogs). */
export declare const WorkspaceBrowser: ComponentType<Record<string, unknown>>;

/** The stock viewing-store factory (grouping/order persistence seat). */
export declare function createWorkspaceViewStore(): unknown;
