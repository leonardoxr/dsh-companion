window.__ModuleLoader__.load({ id: "dsh-companion", factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		const inject = ["slots", "settingsScope"];
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