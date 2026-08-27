# pi-extensions

Monorepo of [pi](https://pi.dev) extensions by Runecraft.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`packages/pi-tui`](./packages/pi-tui) | Customizable TUI — header, footer, editor, context view | `pi install npm:@runecraftai/pi-tui` |
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
pi install npm:@runecraftai/pi-tui
```

The package reads `~/.pi/agent/pi-tui.json`. Configure footer segments under `footer.segments` and their `left`, `center`, or `right` placement under `footer.zones`; supported segment keys include `cwd`, `timer`, `gitBranch`, `gitStatus`, `gitCommit`, `runtime`, `contextBar`, `model`, `thinking`, `tokens`, `cost`, and `extStatus`. Run `/pi-tui reload` after editing the file.

## Footer delivery investigation

- **Trigger:** Start pi in TUI mode with `pi -e ./packages/pi-tui` (or the direct entry file) and a custom `~/.pi/agent/pi-tui.json` whose footer segments differ from the defaults.
- **Masking condition:** The earlier integration looked for `footerData` on `ExtensionContext`, although pi supplies it as the third argument to the `ctx.ui.setFooter` factory. Deferring registration also captured a context that could become stale when pi replaced the session. Successful extension loading and the built-in footer masked both issues.
- **Visible symptom:** The config loaded, but the commander saw the default or incomplete footer instead of the configured context and related segments.
- **Smallest counterfactual and proven path:** Passing the factory-provided data and registering from the active `session_start` context makes the package-root and direct-entry local launches render configured segments. The regression test covers package metadata, `~/.pi/agent/pi-tui.json`, the factory provider, and rendering.
- **Release validation:** The `publish.yml` workflow publishes `npm:@runecraftai/pi-tui` after its version is not already present in the npm registry.
- **Runtime errors:** The implementation keeps registration/rendering errors visible. Only unavailable usage data has an explicit fallback; documentation does not substitute for runtime behavior.
- **PR reconciliation:** PR #3 is closed without merge and is superseded by this fix. PRs #4 and #6 are already merged and closed; their renderer/settings work is retained. None is closed, deleted, or merged by this change.

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
    ctx.ui.setFooter((tui, theme, footerData) => ({
      render(width) { return [footerData.getGitBranch() ?? "no branch"]; },
      invalidate() {},
    }));
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

`.github/workflows/publish.yml` requires an `NPM_TOKEN` repository secret with
publish access to `@runecraftai/pi-tui`. Add it in the repository's **Settings →
Secrets and variables → Actions** page. GitHub Actions also requests an OIDC
token so npm provenance is attached to each publication. The private workspace
root is never published. The Changesets workflow creates version pull requests;
merging one updates the package version, after which `publish.yml` publishes it
on the next push to `main`. Do not add versions or publish packages manually for
normal changes.

## License

MIT
