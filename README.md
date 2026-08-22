# dsh-companion

[![CI](https://github.com/leonardoxr/dsh-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/leonardoxr/dsh-companion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A small [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that gives native clients a read-only JSON view of DSH workspaces and live sessions, a configurable notification event feed, and a Web settings card.

It is designed for client shells such as [dsh-native](https://github.com/leonardoxr/dsh-native) that need project and session metadata without loading or scraping the Harness web UI.

> [!IMPORTANT]
> This project is **not** the unscoped `dsh-companion` package on npm. That name belongs to an unrelated project. Install this plugin from this repository or one of its GitHub Release archives.

## What it provides

- Three small, cache-free JSON endpoints for workspaces and live sessions.
- A reconnectable server-sent-event feed for native completion, failure, question, and approval alerts.
- A **Settings → Plugins → DSH Companion notifications** card that filters alert kinds and subagent events at the source.
- Explicit field projection: internal Harness objects are never serialized wholesale.
- DSH trusted-host and same-origin checks on every request.
- An installable DSH bundle with compiled JavaScript and a small settings-schema dependency.
- Clean unloading: all registered routes are removed with the plugin.

## Install

### From a GitHub Release (recommended)

Download `dsh-companion-<version>.tgz` from the [latest release](https://github.com/leonardoxr/dsh-companion/releases/latest), then add it to the Web profile:

```sh
dsh plugin --profile web add ./dsh-companion-<version>.tgz
dsh web
```

Each release also includes `SHA256SUMS.txt` so the archive can be verified before installation.

### Directly from GitHub

For the newest revision on `main`:

```sh
dsh plugin --profile web add github:leonardoxr/dsh-companion
dsh web
```

A local checkout can be linked in place while developing:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-companion
dsh web
```

Verify the plugin after DSH starts:

```sh
curl http://127.0.0.1:3080/api/companion/workspaces
```

## API

| Route | Response |
|---|---|
| `GET /api/companion/workspaces` | `{ workspaces: [...] }` — durable workspaces and their member session IDs |
| `GET /api/companion/sessions` | `{ sessions: [...] }` — live sessions and their latest folded titles |
| `GET /api/companion/session/<id>` | One live-session summary, or a JSON `404` |
| `GET /api/companion/notifications` | `text/event-stream` feed of configured native alerts |

Example session-list response:

```json
{
  "sessions": [
    {
      "id": "session-1",
      "title": "Implement native navigation",
      "cwd": "/work/dsh-native",
      "createdAt": 1787356800000
    }
  ]
}
```

JSON responses use `Content-Type: application/json` and all routes use `Cache-Control: no-store`. The notification route uses SSE, emits 15-second heartbeats, accepts a prior cursor in `Last-Event-ID` or `?since=`, and keeps a bounded in-memory replay window. A fresh connection starts at the live tail but receives interactions that are still waiting for a question answer or approval. Non-`GET` requests return `405`.

## Notification settings

Open **Settings → Plugins → DSH Companion notifications** in the Harness Web UI to configure:

| Setting | Default | Alert |
|---|---:|---|
| `completed` | on | Successful `turn/end` events |
| `blocked` | on | Blocked turns |
| `errors` | on | Failed turns and live agent errors |
| `maxTokens` | on | Turns that reach the output-token limit |
| `aborted` | off | Cancelled or aborted turns |
| `questions` | on | Pending `ask_user_question` interactions |
| `approvals` | on | Pending tool approvals |
| `subagents` | off | Include events from sessions marked as subagents |

Changes are persisted through the Harness settings service and apply immediately to subsequent events without restarting the companion feed. **Reset defaults** clears the user overrides and restores the values above.

Each notification payload is versioned and contains only a stable key, kind, session ID/title, short body, and timestamp. Raw messages, tool arguments, commands, icons, and click-through URLs are never forwarded.

## Security model

The endpoints expose workspace paths, session IDs, titles, timestamps, session lineage, and—when enabled—short question, approval, and error text. They enforce the Harness web runtime's `trustedHosts` policy and reject cross-site browser requests, but **this is a network trust boundary, not user authentication**.

Do not expose the DSH server to networks whose clients should not read that metadata. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## How it works

The package is a Cordis host module with `name`, `Config`, `inject`, and `apply` exports plus a small Web client plugin. The host declares `webServer`, `webRuntime`, `apiProxy`, `settings`, `sessions`, `sessionTitle`, and `workspaceRegistry` as required services, registers a durable notification-settings namespace, then consumes the existing event streams when the bundle loads.

The host entry point is emitted to `dist/index.js`; the settings card is bundled to `client/client.js` and injected into the standard plugin-settings slot. Unloading or reconfiguring the host plugin aborts event subscriptions, closes SSE clients, and removes every route.

## Compatibility

DeepSeek Harness is currently in developer preview, so its plugin service contracts may change. This version targets the service contracts in the DSH `0.1.1` release-candidate line and requires Node.js 22 or newer. CI covers Node.js 22 and 24.

## Development

```sh
npm ci
npm test
npm pack --dry-run
```

`npm test` rebuilds `dist/` before running tests against the compiled entry point. The committed `dist/` directory is intentional: GitHub dependencies are installed under `node_modules`, where Node does not strip TypeScript syntax at runtime.

If a source change alters generated output, include the updated `dist/` files in the same pull request.

## Contributing and releases

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow and pull-request expectations, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Successful CI runs publish a short-lived, installable package artifact. Version tags such as `v0.1.1` publish the same compiled `.tgz` plus its checksum as a permanent GitHub Release. Maintainers can follow [docs/RELEASING.md](docs/RELEASING.md).

## License

[MIT](LICENSE)
