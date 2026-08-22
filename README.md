# dsh-companion

An out-of-tree [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that exposes read-only workspace and session data as JSON, so native client shells — like [dsh-native](https://github.com/leonardoxr/dsh-native) — can render project managers without booting the full web UI.

## Endpoints

Once loaded, the plugin registers three routes on the harness webserver:

| Route | Returns |
|---|---|
| `GET /api/companion/workspaces` | `{ workspaces: [...] }` — durable workspace list with member session ids |
| `GET /api/companion/sessions` | `{ sessions: [...] }` — live sessions with their latest folded title |
| `GET /api/companion/session/<id>` | one session summary (lineage + log length), or 404 |

Every call reads the owning harness services directly (`workspaceRegistry`, `sessions`, `sessionTitle`); the plugin owns no cache and no event stream. Unloading it withdraws all three routes.

## Install

The package is a [dsh bundle](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish): installing it into a profile links the code *and* appends its `cordis.patch.yml` layer in one step — no hand-written patch file needed.

From a local checkout (linked in place — convenient while hacking on the plugin):

```sh
npx @deepseek-ai/dsh plugin --profile demo add /absolute/path/to/dsh-companion
```

Or straight from GitHub, no checkout required:

```sh
npx @deepseek-ai/dsh plugin --profile demo add github:leonardoxr/dsh-companion
```

Then boot the profile:

```sh
npx @deepseek-ai/dsh web --profile demo
```

Verify:

```sh
curl http://127.0.0.1:3080/api/companion/workspaces
```

## How it works

The plugin is a plain Cordis module (`name` / `inject` / `apply`). It declares `webServer`, `sessions`, `sessionTitle`, and `workspaceRegistry` as required services, registers its routes in `apply`, and returns a disposer that removes them on unload. It imports nothing from the harness at runtime — all types are erased at load — so the repo carries no dependencies and no build step.

## License

[MIT](LICENSE)
