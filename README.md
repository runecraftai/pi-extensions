# pi-extensions

Monorepo of [pi](https://pi.dev) extensions by Runecraft.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`packages/pi-tui`](./packages/pi-tui) | Customizable TUI — header, footer, editor, context view | `pi install npm:@runecraft/pi-tui` |
| [`packages/graphify-pi`](./packages/graphify-pi) | Knowledge-graph query tools (graphify CLI wrapper) | `pi install npm:@runecraft/graphify-pi` |

> **Forward note:** [graphify-pi](https://github.com/runecraftai/graphify-pi) will be consolidated into this monorepo later. No graphify-related work is planned for this phase.

## Getting Started

This is a pnpm/npm workspace monorepo. Each package under `packages/` is a standalone pi extension that can be installed via `pi install` or loaded locally.

### Local package-root invocation

From the repository root:

```bash
npm install
pi -e ./packages/pi-tui
```

Or from the package directory:

```bash
cd packages/pi-tui
pi -e .
```

For direct entry-file testing:

```bash
pi -e ./packages/pi-tui/extensions/pi-tui/index.ts
```

### Installing the published package

```bash
pi install npm:@runecraft/pi-tui
```

The package reads `~/.pi/agent/pi-tui.json`. Its configurable footer supports `cwd`, `timer`, `git`, `runtime`, `context_bar`, `separator`, `stale_runtime`, `model`, `thinking`, `tokens`, `cost`, and `ext_status` segments. Run `/tui reload` after editing the file.

### Installing a package

```bash
pi install npm:@runecraft/graphify-pi
```

## Architecture

Pi extensions register via the `pi` field in `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

The extension entry point exports a default factory function that receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    // Register tools, set UI, etc.
  });
}
```

## Contributing

Each package has its own README with package-specific details. See the pi [extension docs](https://pi.dev/docs/extensions) for the full extension API reference.

Package changes are released independently. Use a conventional commit scoped to
the package (for example, `feat(pi-tui): ...`). On a push to `main`, the release
workflow finds `feat`, `fix`, `perf`, and `refactor` commits, determines affected
packages from their changed files, generates a Changeset, and opens a version pull
request. After that pull request is merged, the workflow publishes only the
affected public packages.

### Release setup

`.github/workflows/release.yml` requires an `NPM_TOKEN` repository secret with
publish access to the `@runecraft` packages. GitHub Actions also requests an OIDC
token so npm provenance is attached to each publication. The private workspace
root is never published. Do not add versions or publish packages manually for
normal changes.

## License

MIT
