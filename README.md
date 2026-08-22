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

Add an insert row to a cordis patch file (for example `companion.cordis.yml`) pointing at your checkout — the path must be absolute:

```yaml
- insert:
    - id: dsh-companion
      name: 'C:/absolute/path/to/dsh-companion/src/index.ts'
```

Add an insert row to a cordis patch file (for example `companion.cordis.yml`) pointing at your checkout. On Windows the loader imports the path as an ESM URL, so use a `file:///` URL and percent-encode spaces:

```yaml
- insert:
    - id: dsh-companion
      name: 'file:///C:/absolute/path/to/dsh-companion/src/index.ts'
```

Then start the harness UI with the overlay:

```sh
pnpm dsh web --patch ./companion.cordis.yml
```

Verify:

```sh
curl http://127.0.0.1:3080/api/companion/workspaces
```

## How it works

The plugin is a plain Cordis module (`name` / `inject` / `apply`). It declares `webServer`, `sessions`, `sessionTitle`, and `workspaceRegistry` as required services, registers its routes in `apply`, and returns a disposer that removes them on unload. It imports nothing from the harness at runtime — all types are erased at load — so the repo carries no dependencies and no build step.

## License

[MIT](LICENSE)
