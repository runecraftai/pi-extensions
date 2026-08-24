# pi-extensions

Monorepo of [pi](https://pi.dev) extensions by Runecraft.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`packages/pi-tui`](./packages/pi-tui) | Customizable TUI — header, footer, editor, context view | **Phase 1** (header + config) |

> **Forward note:** [graphify-pi](https://github.com/runecraftai/graphify-pi) will be consolidated into this monorepo later. No graphify-related work is planned for this phase.

## Getting Started

This is a pnpm/npm workspace monorepo. Each package under `packages/` is a standalone pi extension that can be installed via `pi install` or linked locally.

### Local Development

```bash
# From repo root
npm install

# Link a package for local testing
cd packages/pi-tui
npm link
pi -e ./extensions/pi-tui/index.ts
```

### Installing a Package

Once published to npm:

```bash
pi install @runecraft/pi-tui
```

## Architecture

Pi extensions register via the `pi` field in `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions/pi-tui"]
  }
}
```

The extension entry point exports a default factory function that receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setHeader((tui, theme) => ({
      render(width) { return ["Custom header"]; },
      invalidate() {},
    }));
  });
}
```

## Contributing

Each package has its own README with package-specific details. See the pi [extension docs](https://pi.dev/docs/extensions) for the full extension API reference.

## License

MIT
