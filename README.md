# pi-extensions

Monorepo of [pi](https://pi.dev) extensions by Runecraft.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`packages/pi-tui`](./packages/pi-tui) | Customizable TUI — header, footer, editor | `pi install npm:@runecraft/pi-tui` |
| [`packages/graphify-pi`](./packages/graphify-pi) | Knowledge-graph query tools (graphify CLI wrapper) | `pi install npm:@runecraft/graphify-pi` |

## Getting Started

### Install a package

```bash
pi install npm:@runecraft/pi-tui
pi install npm:@runecraft/graphify-pi
```

### Manual install with `-e` flag

```bash
git clone https://github.com/runecraftai/pi-extensions.git
pi -e pi-extensions/packages/pi-tui
pi -e pi-extensions/packages/graphify-pi
```

### Local development

```bash
git clone https://github.com/runecraftai/pi-extensions.git
cd pi-extensions
npm install
cd packages/pi-tui
npm link
pi -e ./extensions
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

## License

MIT
