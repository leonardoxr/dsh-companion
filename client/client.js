window.__ModuleLoader__.load({ id: "dsh-companion", factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/ImagePreviewTab.tsx
		const IMAGE_PREVIEW_TAB_ID = "dsh-companion:image-preview";
		const EMPTY_SNAPSHOT = { nodes: [] };
		/** Read the optional sidebar service off the context without a hard dependency. */
		function sidebarOf(ctx) {
			const candidate = ctx.betterSidebar;
			if (!candidate || typeof candidate !== "object") return void 0;
			if (typeof candidate.registerTab !== "function") return void 0;
			return candidate;
		}
		function isAttachmentRef(value) {
			return typeof value === "object" && value !== null && typeof value.attachmentId === "string";
		}
		/** Content-block image arm (user/steering/context/tool-result content). */
		function asContentImageBlock(value) {
			if (typeof value !== "object" || value === null) return void 0;
			if (value.type !== "image") return void 0;
			const attachment = value.attachment;
			return isAttachmentRef(attachment) ? attachment : void 0;
		}
		/**
		* Collect unique image attachments from one conversation snapshot, in
		* timeline order: user/steering/context content blocks, assistant image
		* blocks, and tool-result content (e.g. a read_image tool result).
		*/
		function collectPreviewImages(snapshot) {
			const nodes = snapshot?.nodes;
			if (!Array.isArray(nodes)) return [];
			const seen = /* @__PURE__ */ new Set();
			const images = [];
			const record = (attachment) => {
				if (!isAttachmentRef(attachment)) return;
				if (seen.has(attachment.attachmentId)) return;
				seen.add(attachment.attachmentId);
				images.push(attachment);
			};
			for (const node of nodes) {
				if (!node || typeof node !== "object") continue;
				const kind = node.kind;
				if (kind === "assistant") {
					const blocks = node.blocks;
					if (!Array.isArray(blocks)) continue;
					for (const block of blocks) if (typeof block === "object" && block !== null && block.kind === "image") record(block.attachment);
				} else if (kind === "user" || kind === "steering" || kind === "context" || kind === "tool-result") {
					const content = node.content;
					if (!Array.isArray(content)) continue;
					for (const block of content) record(asContentImageBlock(block));
				}
			}
			return images;
		}
		function formatDimensions(image) {
			return image.width > 0 && image.height > 0 ? String(image.width) + "×" + String(image.height) : "—";
		}
		function formatBytes(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return "—";
			if (bytes < 1024) return String(bytes) + " B";
			if (bytes < 1048576) return (bytes / 1024).toFixed(0) + " KB";
			return (bytes / 1048576).toFixed(1) + " MB";
		}
		/** Copy RPC bytes into an exact-size ArrayBuffer accepted by Blob in every TS lib. */
		function toBlobPart(data) {
			return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
		}
		function ImagePreviewTab({ ctx, scope, visible }) {
			const session = (0, react.useMemo)(() => {
				return ctx.sessions?.binding?.(scope.sessionId)?.session ?? null;
			}, [ctx, scope.sessionId]);
			const subscribe = (0, react.useCallback)((listener) => session?.subscribe(listener) ?? (() => {}), [session]);
			const getSnapshot = (0, react.useCallback)(() => session?.getSnapshot() ?? EMPTY_SNAPSHOT, [session]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const images = (0, react.useMemo)(() => collectPreviewImages(snapshot), [snapshot]);
			const imagesRef = (0, react.useRef)(images);
			imagesRef.current = images;
			const imageKey = images.map((image) => image.attachmentId).join("\n");
			const cacheRef = (0, react.useRef)(/* @__PURE__ */ new Map());
			const [, bump] = (0, react.useReducer)((count) => count + 1, 0);
			const [selectedId, setSelectedId] = (0, react.useState)();
			const [retryTick, setRetryTick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const cache = cacheRef.current;
				return () => {
					for (const entry of cache.values()) if (entry.status === "ready") URL.revokeObjectURL(entry.url);
					cache.clear();
				};
			}, [session]);
			(0, react.useEffect)(() => {
				if (!session || !visible) return;
				const pending = imagesRef.current.filter((image) => !cacheRef.current.has(image.attachmentId));
				if (pending.length === 0) return;
				let cancelled = false;
				for (const image of pending) cacheRef.current.set(image.attachmentId, { status: "loading" });
				bump();
				Promise.all(pending.map(async (image) => {
					try {
						const result = await session.readAttachment(image.attachmentId);
						if (cancelled) return;
						if (result.ok) {
							const mediaType = result.value.attachment.mediaType || "image/png";
							const url = URL.createObjectURL(new Blob([toBlobPart(result.value.data)], { type: mediaType }));
							cacheRef.current.set(image.attachmentId, {
								status: "ready",
								url
							});
						} else cacheRef.current.set(image.attachmentId, {
							status: "error",
							message: result.error.message
						});
					} catch (cause) {
						if (cancelled) return;
						cacheRef.current.set(image.attachmentId, {
							status: "error",
							message: cause instanceof Error ? cause.message : String(cause)
						});
					}
					if (!cancelled) bump();
				}));
				return () => {
					cancelled = true;
				};
			}, [
				session,
				visible,
				imageKey,
				retryTick
			]);
			(0, react.useEffect)(() => {
				if (selectedId === void 0) return;
				const onKey = (event) => {
					if (event.key === "Escape") setSelectedId(void 0);
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [selectedId]);
			const retry = (0, react.useCallback)(() => {
				for (const [id, entry] of cacheRef.current) if (entry.status === "error") cacheRef.current.delete(id);
				setRetryTick((tick) => tick + 1);
			}, []);
			if (!session) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsc-img-tab",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsc-img-empty",
					children: "Select a conversation to browse its images."
				})
			});
			if (images.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsc-img-tab",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsc-img-empty",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "No images yet" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Attachments you send and images the model reads appear here." })]
				})
			});
			const selectedEntry = selectedId !== void 0 ? cacheRef.current.get(selectedId) : void 0;
			const selectedImage = selectedId !== void 0 ? images.find((image) => image.attachmentId === selectedId) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsc-img-tab",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsc-img-count",
						children: [
							images.length,
							" image",
							images.length === 1 ? "" : "s",
							" in this conversation"
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsc-img-grid",
						children: images.map((image) => {
							const entry = cacheRef.current.get(image.attachmentId);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figure", {
								className: "dsc-img-tile",
								onClick: () => {
									if (entry?.status === "ready") setSelectedId(image.attachmentId);
								},
								children: [entry?.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									className: "dsc-img-thumb",
									src: entry.url,
									alt: image.name || "Image attachment",
									loading: "lazy",
									draggable: false
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsc-img-thumb " + (entry?.status === "error" ? "dsc-img-broken" : "dsc-img-loading"),
									children: entry?.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										title: entry.message,
										onClick: (event) => {
											event.stopPropagation();
											retry();
										},
										children: "Retry"
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Loading..." })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figcaption", {
									className: "dsc-img-meta",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: image.name || "Image" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatDimensions(image) + " · " + formatBytes(image.bytes) })]
								})]
							}, image.attachmentId);
						})
					}),
					selectedId !== void 0 && selectedEntry?.status === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsc-img-lightbox",
						role: "dialog",
						"aria-modal": "true",
						onClick: () => setSelectedId(void 0),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsc-img-lightbox-bar",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: selectedImage ? (selectedImage.name || "Image") + " — " + formatDimensions(selectedImage) + " · " + formatBytes(selectedImage.bytes) : "" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsc-img-close",
								type: "button",
								onClick: () => setSelectedId(void 0),
								children: "Close"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							src: selectedEntry.url,
							alt: selectedImage?.name || "Image attachment",
							draggable: false,
							onClick: (event) => event.stopPropagation()
						})]
					})
				]
			});
		}
		const STYLE_ID$2 = "dsh-companion/image-preview";
		const STYLE_LINES = [
			".dsc-img-tab{box-sizing:border-box;height:100%;overflow:auto;padding:14px;color:var(--dsw-alias-label-primary,#111);font-size:13px;line-height:18px}",
			".dsc-img-tab *{box-sizing:border-box}",
			".dsc-img-count{margin-bottom:10px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}",
			".dsc-img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}",
			".dsc-img-tile{margin:0;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-elevated,#fff);cursor:pointer;display:flex;flex-direction:column;min-width:0}",
			".dsc-img-tile:hover{border-color:var(--dsw-alias-accent-primary,#4c7dff)}",
			".dsc-img-thumb{width:100%;height:112px;display:block;object-fit:cover;background:var(--dsw-alias-bg-layer-2,#f3f3f3)}",
			".dsc-img-thumb.dsc-img-loading,.dsc-img-thumb.dsc-img-broken{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#888);font-size:11px;text-align:center;padding:6px}",
			".dsc-img-thumb.dsc-img-broken{cursor:pointer;color:var(--dsw-alias-label-danger,#d44)}",
			".dsc-img-meta{display:flex;flex-direction:column;gap:1px;padding:6px 8px;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));font-size:11px;color:var(--dsw-alias-label-secondary,#555)}",
			".dsc-img-meta span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;color:inherit}",
			".dsc-img-empty{display:flex;flex-direction:column;gap:4px;align-items:flex-start;margin-top:32px;color:var(--dsw-alias-label-tertiary,#777)}",
			".dsc-img-empty b{color:var(--dsw-alias-label-primary,#111);font-size:14px}",
			".dsc-img-lightbox{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.74);padding:44px 20px 24px;display:flex;align-items:center;justify-content:center}",
			".dsc-img-lightbox img{max-width:min(1100px,100%);max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,.55)}",
			".dsc-img-lightbox-bar{position:absolute;top:12px;left:18px;right:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff;font-size:12px}",
			".dsc-img-close{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;border-radius:7px;padding:5px 12px;font-size:12px;cursor:pointer}",
			".dsc-img-close:hover{background:rgba(255,255,255,.22)}"
		];
		/**
		* Register the Images tab when the optional dsh-better-sidebar service is
		* present; styles live and die with the registration effect (HMR-safe).
		*/
		function registerImagePreviewTab(ctx) {
			const sidebar = sidebarOf(ctx);
			if (!sidebar) return;
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-companion";
				tag.dataset.pluginCss = STYLE_ID$2;
				tag.textContent = STYLE_LINES.join("\n");
				document.head.append(tag);
				const disposeTab = sidebar.registerTab({
					id: IMAGE_PREVIEW_TAB_ID,
					title: () => "Images",
					order: 55,
					single: true,
					component: ImagePreviewTab
				});
				return () => {
					disposeTab();
					tag.remove();
				};
			}, "dsh-companion: image preview tab");
		}
		//#endregion
		//#region src/workspace-sidebar-model.ts
		function isNativeWorkspaceBridge(value) {
			if (typeof value !== "object" || value === null) return false;
			const candidate = value;
			return typeof candidate.getSnapshot === "function" && typeof candidate.refresh === "function" && typeof candidate.connect === "function";
		}
		function originOf(value) {
			try {
				return new URL(value).origin;
			} catch {
				return null;
			}
		}
		function filterWorkspaceRows(rows, query) {
			const needle = query.trim().toLocaleLowerCase();
			if (needle === "") return [...rows];
			return rows.filter((row) => [
				row.title,
				row.path,
				row.hostName,
				row.hostUrl,
				...(row.sessions ?? []).map((session) => session.title)
			].some((value) => value.toLocaleLowerCase().includes(needle)));
		}
		function sessionCountLabel(row) {
			if (row.liveSessions !== null && row.liveSessions !== row.totalSessions) return `${row.liveSessions} of ${row.totalSessions}`;
			return String(row.totalSessions);
		}
		//#endregion
		//#region src/client/NativeWorkspaceSidebar.tsx
		const STYLE_ID$1 = "dsh-companion/native-workspace-sidebar";
		const REFRESH_INTERVAL_MS = 6e4;
		const SHADOW_PRIORITY = -1;
		function nativeWorkspaceBridgeOf(value = window.dshNativeWorkspaces) {
			return isNativeWorkspaceBridge(value) ? value : void 0;
		}
		function installWorkspaceStyles() {
			document.querySelector(`style[data-plugin="${STYLE_ID$1}"]`)?.remove();
			const tag = document.createElement("style");
			tag.dataset.plugin = STYLE_ID$1;
			tag.textContent = `
    .dsc-workspaces { display:flex; min-height:0; flex:1; flex-direction:column; color:var(--ds-color-text-1,#f2f2f2); }
    .dsc-ws-head { display:flex; align-items:center; gap:8px; padding:18px 20px 10px; }
    .dsc-ws-title { flex:1; font-size:15px; font-weight:500; color:var(--ds-color-text-2,#b9b9bd); }
    .dsc-ws-icon { width:32px; height:32px; border:0; border-radius:8px; color:inherit; background:transparent; cursor:pointer; }
    .dsc-ws-icon:hover,.dsc-ws-icon:focus-visible { background:var(--ds-color-bg-3,#303033); outline:none; }
    .dsc-ws-search { margin:0 14px 8px; width:calc(100% - 28px); box-sizing:border-box; border:1px solid var(--ds-color-border-2,#3f3f43); border-radius:9px; padding:8px 10px; color:inherit; background:var(--ds-color-bg-2,#252527); }
    .dsc-ws-scroll { min-height:0; overflow:auto; padding:2px 10px 18px; scrollbar-gutter:stable; }
    .dsc-ws-empty,.dsc-ws-error { padding:18px 12px; color:var(--ds-color-text-3,#85858a); font-size:13px; line-height:1.45; }
    .dsc-ws-error { color:var(--ds-color-error,#df7777); }
    .dsc-ws-group { margin:2px 0; border-radius:10px; }
    .dsc-ws-row { display:flex; width:100%; min-width:0; align-items:center; border-radius:9px; background:transparent; }
    .dsc-ws-row:hover,.dsc-ws-row:focus-within { background:var(--ds-color-bg-3,#303033); }
    .dsc-ws-main { display:flex; min-width:0; flex:1; align-items:center; gap:8px; border:0; border-radius:9px; padding:8px 4px 8px 9px; text-align:left; color:inherit; background:transparent; cursor:pointer; }
    .dsc-ws-main:focus-visible { outline:1px solid var(--ds-color-primary,#72a7ff); outline-offset:-1px; }
    .dsc-ws-chevron { width:12px; color:var(--ds-color-text-3,#85858a); font-size:11px; }
    .dsc-ws-copy { min-width:0; flex:1; }
    .dsc-ws-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:550; }
    .dsc-ws-meta { display:flex; min-width:0; gap:6px; margin-top:3px; color:var(--ds-color-text-3,#85858a); font-size:10px; }
    .dsc-ws-server { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dsc-ws-current { color:var(--ds-color-primary,#72a7ff); }
    .dsc-ws-stale { opacity:.58; }
    .dsc-ws-new { width:28px; height:28px; flex:0 0 auto; margin-right:4px; border:0; border-radius:7px; color:inherit; background:transparent; cursor:pointer; font-size:17px; }
    .dsc-ws-new:hover,.dsc-ws-new:focus-visible { background:var(--ds-color-bg-4,#3a3a3e); outline:none; }
    .dsc-ws-sessions { margin-left:22px; padding:0 0 4px; }
    .dsc-session { display:flex; width:100%; min-width:0; align-items:center; gap:7px; border:0; border-radius:8px; padding:7px 9px; color:var(--ds-color-text-2,#c7c7ca); background:transparent; cursor:pointer; text-align:left; }
    .dsc-session:hover,.dsc-session:focus-visible,.dsc-session-selected { background:var(--ds-color-bg-3,#303033); color:var(--ds-color-text-1,#fff); outline:none; }
    .dsc-session-dot { width:5px; height:5px; flex:0 0 auto; border-radius:50%; background:var(--ds-color-text-3,#85858a); }
    .dsc-session-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
    .dsc-ws-rail { display:flex; flex:1; align-items:flex-start; justify-content:center; padding-top:16px; }
    .dsc-ws-rail .dsc-ws-icon { width:36px; height:36px; font-size:18px; }
    @media (prefers-reduced-motion:no-preference) { .dsc-ws-row,.dsc-ws-main,.dsc-ws-new,.dsc-session,.dsc-ws-icon { transition:background-color 120ms ease,color 120ms ease; } }
  `;
			document.head.append(tag);
			return () => tag.remove();
		}
		function WorkspaceGroup(props) {
			const { row, expanded, currentOrigin, currentSessionId, onToggle, onConnect, onStartSession, onOpenSession } = props;
			const onCurrentHost = originOf(row.hostUrl) === currentOrigin;
			const sessions = row.sessions ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: `dsc-ws-group${row.stale === true ? " dsc-ws-stale" : ""}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsc-ws-row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "dsc-ws-main",
						type: "button",
						onClick: onToggle,
						title: row.path,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsc-ws-chevron",
							"aria-hidden": "true",
							children: expanded ? "▾" : "▸"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsc-ws-copy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsc-ws-name",
								children: row.title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsc-ws-meta",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: onCurrentHost ? "dsc-ws-server dsc-ws-current" : "dsc-ws-server",
									children: row.hostName
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-label": `${row.totalSessions} sessions`,
									children: sessionCountLabel(row)
								})]
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "dsc-ws-new",
						type: "button",
						title: onCurrentHost ? "New session" : `Open ${row.hostName}`,
						"aria-label": onCurrentHost ? `New session in ${row.title}` : `Open ${row.hostName}`,
						onClick: () => {
							if (onCurrentHost) onStartSession();
							else onConnect();
						},
						children: onCurrentHost ? "+" : "↗"
					})]
				}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsc-ws-sessions",
					children: [sessions.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: `dsc-session${onCurrentHost && currentSessionId === session.id ? " dsc-session-selected" : ""}`,
						type: "button",
						title: session.cwd ?? session.title,
						onClick: () => {
							if (onCurrentHost) onOpenSession(session.id);
							else onConnect();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsc-session-dot",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsc-session-label",
							children: session.title
						})]
					}, session.id)), sessions.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsc-ws-empty",
						children: "No sessions yet"
					})]
				})]
			});
		}
		function NativeWorkspaceSidebar(props) {
			const { wide, expandSidebar, useSessions, startSession, open, bridge } = props;
			const currentSessionId = useSessions((state) => state.current);
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [expanded, setExpanded] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const currentOrigin = window.location.origin;
			const load = (0, react.useCallback)(async (refresh) => {
				try {
					const next = refresh ? await bridge.refresh() : await bridge.getSnapshot();
					setSnapshot(next);
					setError(null);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, [bridge]);
			(0, react.useEffect)(() => {
				load(false).then(() => load(true));
				const timer = window.setInterval(() => {
					if (document.visibilityState === "visible") load(true);
				}, REFRESH_INTERVAL_MS);
				return () => window.clearInterval(timer);
			}, [load]);
			(0, react.useEffect)(() => {
				if (snapshot === null || expanded.size > 0) return;
				const currentRows = snapshot.rows.filter((row) => originOf(row.hostUrl) === currentOrigin);
				if (currentRows.length > 0) setExpanded(new Set(currentRows.map((row) => `${row.hostId}:${row.id}`)));
			}, [
				currentOrigin,
				expanded.size,
				snapshot
			]);
			const rows = (0, react.useMemo)(() => filterWorkspaceRows(snapshot?.rows ?? [], query), [query, snapshot]);
			if (!wide) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsc-ws-rail",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsc-ws-icon",
					type: "button",
					"aria-label": "Show workspaces",
					title: "Workspaces",
					onClick: expandSidebar,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						"aria-hidden": "true",
						viewBox: "0 0 20 20",
						width: "18",
						height: "18",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.5",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.75 5.25A1.5 1.5 0 0 1 4.25 3.75h4l1.5 1.5h6A1.5 1.5 0 0 1 17.25 6.75v7A1.5 1.5 0 0 1 15.75 15.25H4.25a1.5 1.5 0 0 1-1.5-1.5z" })
					})
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsc-workspaces",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "dsc-ws-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsc-ws-title",
							children: "Workspaces"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsc-ws-icon",
							type: "button",
							"aria-label": "Refresh workspaces",
							title: "Refresh",
							onClick: () => void load(true),
							children: "↻"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: "dsc-ws-search",
						type: "search",
						value: query,
						placeholder: "Search workspaces",
						"aria-label": "Search workspaces",
						onChange: (event) => setQuery(event.currentTarget.value)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsc-ws-scroll",
						children: [
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsc-ws-error",
								children: error
							}),
							snapshot === null && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsc-ws-empty",
								children: "Loading workspaces…"
							}),
							snapshot !== null && rows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsc-ws-empty",
								children: "No matching workspaces"
							}),
							rows.map((row) => {
								const key = `${row.hostId}:${row.id}`;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceGroup, {
									row,
									expanded: expanded.has(key),
									currentOrigin,
									currentSessionId,
									onToggle: () => setExpanded((current) => {
										const next = new Set(current);
										if (next.has(key)) next.delete(key);
										else next.add(key);
										return next;
									}),
									onConnect: () => {
										bridge.connect(row.hostId);
									},
									onStartSession: () => startSession(row.id),
									onOpenSession: open
								}, key);
							})
						]
					})
				]
			});
		}
		function registerNativeWorkspaceSidebar(ctx) {
			const bridge = nativeWorkspaceBridgeOf();
			if (bridge === void 0) return;
			const client = ctx;
			ctx.effect(installWorkspaceStyles, "dsh-companion: native workspace sidebar styles");
			client.slots.inject("sidebar.workspaces", () => client.slots.register({
				name: "sidebar.workspaces",
				priority: SHADOW_PRIORITY,
				inject: () => ({
					bridge,
					startSession: (workspaceId) => client.workspaces.startSession(workspaceId),
					open: (sessionId) => client.sessions.open(sessionId)
				})
			}, NativeWorkspaceSidebar));
		}
		//#endregion
		//#region src/client/index.tsx
		const PLUGIN_ID = "dsh-companion";
		const NS = "companion-notifications";
		const STYLE_ID = "dsh-companion/settings";
		const OPTIONS = [
			{
				key: "completed",
				label: "Completed turns",
				description: "Show an alert when a turn completes successfully."
			},
			{
				key: "blocked",
				label: "Blocked agents",
				description: "Show an alert when an agent reports that it is blocked."
			},
			{
				key: "errors",
				label: "Failures",
				description: "Show alerts for failed turns and live agent errors."
			},
			{
				key: "maxTokens",
				label: "Maximum tokens",
				description: "Show an alert when a turn reaches its output-token limit."
			},
			{
				key: "aborted",
				label: "Aborted turns",
				description: "Show an alert when a turn is cancelled or aborted."
			},
			{
				key: "questions",
				label: "Questions",
				description: "Show an alert when ask_user_question needs an answer."
			},
			{
				key: "approvals",
				label: "Approvals",
				description: "Show an alert when a tool action needs approval."
			},
			{
				key: "subagents",
				label: "Subagent sessions",
				description: "Include enabled alerts from subagent sessions."
			}
		];
		const inject = [
			"slots",
			"settingsScope",
			"betterSidebar",
			"sessions",
			"workspaces"
		];
		function decodeSettings(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const item = value;
			if (OPTIONS.some((option) => typeof item[option.key] !== "boolean")) return void 0;
			return item;
		}
		function installStyles() {
			document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)?.remove();
			const tag = document.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = `
    .dsc-card{box-sizing:border-box;max-width:720px;color:var(--dsw-alias-label-primary);list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;overflow:hidden;background:var(--dsw-alias-bg-elevated,transparent)}
    .dsc-head{padding:20px 22px 14px}.dsc-title{font-size:16px;line-height:24px;font-weight:600}.dsc-description{margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
    .dsc-options{border-top:1px solid var(--dsw-alias-border-l2)}.dsc-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 22px}.dsc-row+.dsc-row{border-top:1px solid var(--dsw-alias-border-l2)}
    .dsc-copy{min-width:0}.dsc-label{font-size:14px;line-height:21px;font-weight:500}.dsc-help{margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
    .dsc-toggle{width:42px;height:24px;flex:none;appearance:none;border:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-disabled,#777);padding:2px;cursor:pointer;transition:background .15s ease}.dsc-toggle:checked{background:var(--dsw-alias-accent-primary,#4c7dff)}.dsc-toggle:before{content:'';display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 3px #0004}.dsc-toggle:checked:before{transform:translateX(18px)}.dsc-toggle:disabled{cursor:not-allowed;opacity:.5}
    .dsc-status{padding:16px 22px;color:var(--dsw-alias-label-tertiary);font-size:13px}.dsc-error{color:var(--dsw-alias-label-danger,#d44)}
    .dsc-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid var(--dsw-alias-border-l2);padding:12px 22px}.dsc-reset{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;padding:6px 11px;cursor:pointer}.dsc-reset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsc-reset:disabled{cursor:not-allowed;opacity:.5}
  `;
			document.head.append(tag);
			return () => tag.remove();
		}
		function SettingsCard({ settings }) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => settings.subscribe(listener), () => settings.getSnapshot(), () => settings.getSnapshot());
			const [busy, setBusy] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const update = async (key, value) => {
				setBusy(key);
				setError(void 0);
				try {
					await settings.set(key, value);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(void 0);
				}
			};
			const reset = async () => {
				setBusy("reset");
				setError(void 0);
				try {
					for (const option of OPTIONS) await settings.unset(option.key);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(void 0);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "dsc-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsc-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsc-title",
						children: "DSH Companion notifications"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsc-description",
						children: "Choose which agent events become native operating-system notifications."
					})]
				}), snapshot.status === "ready" && snapshot.value ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsc-options",
					children: OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsc-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsc-copy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsc-label",
								children: option.label
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsc-help",
								children: option.description
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dsc-toggle",
							type: "checkbox",
							checked: snapshot.value[option.key],
							disabled: !snapshot.writable || busy !== void 0,
							onChange: (event) => void update(option.key, event.currentTarget.checked)
						})]
					}, option.key))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsc-footer",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: error ? "dsc-status dsc-error" : "dsc-status",
						children: error ?? (snapshot.writable ? "Changes apply immediately." : "Settings are read-only in this runtime.")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "dsc-reset",
						type: "button",
						disabled: !snapshot.writable || busy !== void 0,
						onClick: () => void reset(),
						children: "Reset defaults"
					})]
				})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsc-status",
					children: snapshot.status === "loading" ? "Loading notification settings…" : "The companion settings namespace is unavailable."
				})]
			});
		}
		function apply(ctx) {
			ctx.effect(installStyles, "dsh-companion: settings styles");
			registerImagePreviewTab(ctx);
			registerNativeWorkspaceSidebar(ctx);
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: NS,
				inject: () => ({ settings: ctx.settingsScope.bind({
					namespace: NS,
					decode: decodeSettings
				}) })
			}, SettingsCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map