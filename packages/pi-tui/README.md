# @runecraftai/pi-tui

Customizable TUI extension for [pi](https://pi.dev) with an animated header, configurable footer, context view, and interactive settings.

## Features

- **Animated Logo and Info Bar** — Pi version, model, thinking effort, and system stats
- **Configurable Nerd Font Icons** — Header and footer icons support per-segment overrides; set an icon to `""` to disable it
- **Two-Line Footer** — Configurable left, center, and right zones; by default, project identity is left-packed and the context bar fills the remaining width
- **Smart Context Bar** — Smart/warm/dumb zones at 40% and 70% context usage, plus a compact mode
- **Async Git Status** — Branch, ahead/behind, staged, modified, untracked, renamed, deleted, conflicted, and stash counts
- **Priority Degradation** — Lower-priority footer segments are dropped first on narrow terminals
- **Interactive Settings** — `/pi-tui` opens General, Appearance, and Footer settings; `/pi-tui reload` reloads the JSON config

## Installation

### Published package

```bash
pi install npm:@runecraftai/pi-tui
```

### Local package root

From the repository root:

```bash
pi -e ./packages/pi-tui
```

Or from this package directory:

```bash
cd packages/pi-tui
pi -e .
```

### Direct entry file

Use this when testing only the extension entry file:

```bash
pi -e ./packages/pi-tui/extensions/pi-tui/index.ts
```

## Configuration

Create or edit `~/.pi/agent/pi-tui.json`. Partial objects are supported; omitted values use defaults.

```json
{
  "enabled": true,
  "header": {
    "enabled": true,
    "showVersion": true,
    "showModel": true,
    "showCwd": true,
    "icons": {
      "version": "󱅴",
      "model": "󰀫",
      "cwd": ""
    }
  },
  "footer": {
    "enabled": true,
    "segments": {
      "cwd": true,
      "timer": true,
      "gitBranch": true,
      "gitStatus": true,
      "gitCommit": false,
      "contextBar": true,
      "model": true,
      "thinking": true,
      "tokens": true,
      "cost": true,
      "extStatus": true
    },
    "zones": {
      "cwd": "left",
      "gitBranch": "left",
      "gitStatus": "left",
      "gitCommit": "left",
      "timer": "right",
      "contextBar": "right",
      "model": "right",
      "thinking": "right",
      "tokens": "right",
      "cost": "right",
      "extStatus": "right"
    },
    "git": { "showBranch": true, "showStatus": true, "showCommit": false },
    "context": { "showBar": true, "showCompact": false },
    "tokens": { "showInput": true, "showOutput": true, "showCache": true }
  },
  "icons": { "mode": "auto", "custom": {} }
}
```

`icons.mode` accepts `auto`, `nerd`, or `ascii`. `auto` uses the Nerd Font glyph path like `nerd`; it does not detect terminal capability, so choose `ascii` for an ASCII-safe fallback. `ascii` disables Nerd Font prefixes while retaining the existing text markers. `icons.custom` is a global override map; segment-specific settings take precedence.

### Icon options

Header icons are configured under `header.icons`: `version`, `model`, `skills`, `prompts`, `extensions`, and `cwd`.

Footer icon options are configured on the matching footer object:

| Segment | Config key |
| --- | --- |
| Git branch/status/commit | `footer.git.icon` |
| Timer | `footer.timer.icon` |
| Context bar | `footer.context.icon` |
| Model | `footer.model.icon` |
| Thinking | `footer.thinking.icon` |
| Token input/output/cache | `footer.tokens.inputIcon`, `outputIcon`, `cacheIcon` |
| Cost | `footer.cost.icon` |
| Extension status | `footer.extStatus.icon` |

Set any icon to `""` to suppress it.

### Footer layout

The footer uses `left`, `center`, and `right` zones. Assign each segment with
`footer.zones`; the settings dialog cycles a selected segment's zone when you
press **Enter**.

### Footer segments

| Segment | Description |
| --- | --- |
| `cwd` | Current working directory |
| `timer` | Session elapsed timer |
| `gitBranch` | Current branch |
| `gitStatus` | Working-tree and ahead/behind indicators |
| `gitCommit` | Short latest commit and tag when configured |
| `contextBar` | Context usage visualization |
| `model` | Current model |
| `thinking` | Current thinking level |
| `tokens` | Input, output, and cache usage |
| `cost` | Session cost |
| `extStatus` | Extension status values |

The default footer packs project identity on the left and metrics on the right.
The context bar uses the remaining space when configured. Priority order is
defined by `FOOTER_PRIORITY` in `extensions/pi-tui/footer/index.ts`.

## Data dependencies

The footer receives Git branch and extension status data from the third
`ctx.ui.setFooter` factory argument. Token and cost segments aggregate usage
from session entries, and context usage comes from `ctx.getContextUsage()`.

The npm package is published from `packages/pi-tui` by the repository's
Changesets and GitHub Actions release workflows. Install it with the exact
source identifier `npm:@runecraftai/pi-tui` shown above.

## Settings

Run `/pi-tui` to open the settings dialog. **Tab** / **←** / **→** switch tabs, **↑** / **↓** navigate, **Space** toggles values, **Enter** cycles footer zones, and **Esc** / **q** closes the dialog.

## License

MIT
