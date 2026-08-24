import { useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { registerImagePreviewTab } from './ImagePreviewTab'
import { registerNativeWorkspaceSidebar } from './NativeWorkspaceSidebar'

const PLUGIN_ID = 'dsh-companion'
const NS = 'companion-notifications'
const STYLE_ID = 'dsh-companion/settings'

interface NotificationSettings {
  completed: boolean
  blocked: boolean
  errors: boolean
  maxTokens: boolean
  aborted: boolean
  questions: boolean
  approvals: boolean
  subagents: boolean
}

interface SettingsCardProps {
  settings: SettingsScope<NotificationSettings>
}

type SettingKey = keyof NotificationSettings

const OPTIONS: ReadonlyArray<{ key: SettingKey; label: string; description: string }> = [
  { key: 'completed', label: 'Completed turns', description: 'Show an alert when a turn completes successfully.' },
  { key: 'blocked', label: 'Blocked agents', description: 'Show an alert when an agent reports that it is blocked.' },
  { key: 'errors', label: 'Failures', description: 'Show alerts for failed turns and live agent errors.' },
  { key: 'maxTokens', label: 'Maximum tokens', description: 'Show an alert when a turn reaches its output-token limit.' },
  { key: 'aborted', label: 'Aborted turns', description: 'Show an alert when a turn is cancelled or aborted.' },
  { key: 'questions', label: 'Questions', description: 'Show an alert when ask_user_question needs an answer.' },
  { key: 'approvals', label: 'Approvals', description: 'Show an alert when a tool action needs approval.' },
  { key: 'subagents', label: 'Subagent sessions', description: 'Include enabled alerts from subagent sessions.' },
]

export const inject = ['slots', 'settingsScope', 'betterSidebar', 'sessions', 'workspaces']

function decodeSettings(value: unknown): NotificationSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const item = value as Partial<NotificationSettings>
  if (OPTIONS.some(option => typeof item[option.key] !== 'boolean')) return undefined
  return item as NotificationSettings
}

function installStyles(): () => void {
  document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)?.remove()
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = `
    .dsc-card{box-sizing:border-box;max-width:720px;color:var(--dsw-alias-label-primary);list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;overflow:hidden;background:var(--dsw-alias-bg-elevated,transparent)}
    .dsc-head{padding:20px 22px 14px}.dsc-title{font-size:16px;line-height:24px;font-weight:600}.dsc-description{margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
    .dsc-options{border-top:1px solid var(--dsw-alias-border-l2)}.dsc-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 22px}.dsc-row+.dsc-row{border-top:1px solid var(--dsw-alias-border-l2)}
    .dsc-copy{min-width:0}.dsc-label{font-size:14px;line-height:21px;font-weight:500}.dsc-help{margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
    .dsc-toggle{width:42px;height:24px;flex:none;appearance:none;border:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-disabled,#777);padding:2px;cursor:pointer;transition:background .15s ease}.dsc-toggle:checked{background:var(--dsw-alias-accent-primary,#4c7dff)}.dsc-toggle:before{content:'';display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 3px #0004}.dsc-toggle:checked:before{transform:translateX(18px)}.dsc-toggle:disabled{cursor:not-allowed;opacity:.5}
    .dsc-status{padding:16px 22px;color:var(--dsw-alias-label-tertiary);font-size:13px}.dsc-error{color:var(--dsw-alias-label-danger,#d44)}
    .dsc-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid var(--dsw-alias-border-l2);padding:12px 22px}.dsc-reset{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;padding:6px 11px;cursor:pointer}.dsc-reset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsc-reset:disabled{cursor:not-allowed;opacity:.5}
  `
  document.head.append(tag)
  return () => tag.remove()
}

function SettingsCard({ settings }: SettingsCardProps) {
  const snapshot = useSyncExternalStore(
    listener => settings.subscribe(listener),
    () => settings.getSnapshot(),
    () => settings.getSnapshot(),
  )
  const [busy, setBusy] = useState<SettingKey | 'reset' | undefined>()
  const [error, setError] = useState<string>()

  const update = async (key: SettingKey, value: boolean) => {
    setBusy(key)
    setError(undefined)
    try {
      await settings.set(key, value)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const reset = async () => {
    setBusy('reset')
    setError(undefined)
    try {
      for (const option of OPTIONS) await settings.unset(option.key)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  return <li className="dsc-card">
    <div className="dsc-head">
      <div className="dsc-title">DSH Companion notifications</div>
      <div className="dsc-description">Choose which agent events become native operating-system notifications.</div>
    </div>
    {snapshot.status === 'ready' && snapshot.value ? <>
      <div className="dsc-options">
        {OPTIONS.map(option => <label className="dsc-row" key={option.key}>
          <span className="dsc-copy">
            <span className="dsc-label">{option.label}</span>
            <span className="dsc-help">{option.description}</span>
          </span>
          <input
            className="dsc-toggle"
            type="checkbox"
            checked={snapshot.value![option.key]}
            disabled={!snapshot.writable || busy !== undefined}
            onChange={event => void update(option.key, event.currentTarget.checked)}
          />
        </label>)}
      </div>
      <div className="dsc-footer">
        <span className={error ? 'dsc-status dsc-error' : 'dsc-status'}>{error ?? (snapshot.writable ? 'Changes apply immediately.' : 'Settings are read-only in this runtime.')}</span>
        <button className="dsc-reset" type="button" disabled={!snapshot.writable || busy !== undefined} onClick={() => void reset()}>Reset defaults</button>
      </div>
    </> : <div className="dsc-status">
      {snapshot.status === 'loading' ? 'Loading notification settings…' : 'The companion settings namespace is unavailable.'}
    </div>}
  </li>
}

export function apply(ctx: Context): void {
  ctx.effect(installStyles, 'dsh-companion: settings styles')
  registerImagePreviewTab(ctx)
  registerNativeWorkspaceSidebar(ctx)
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NS,
    inject: () => ({
      settings: ctx.settingsScope.bind<NotificationSettings>({ namespace: NS, decode: decodeSettings }),
    }),
  }, SettingsCard))
}
