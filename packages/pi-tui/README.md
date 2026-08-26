# @runecraft/pi-tui

Customizable TUI extension for [pi](https://pi.dev) with an animated header, configurable footer, and interactive settings.

## Features

- **Animated Logo and Info Bar** — Pi version, model, thinking effort, and system stats
- **Configurable Nerd Font Icons** — Header and footer icons support per-segment overrides; set an icon to `""` to disable it
- **Two-Line Footer** — Left-packed project identity and session metrics, with a context bar filling the remaining width
- **Smart Context Bar** — Smart/warm/dumb zones at 40% and 70% context usage, plus a compact mode
- **Async Git Status** — Branch, ahead/behind, staged, modified, untracked, renamed, deleted, conflicted, and stash counts
- **Priority Degradation** — Lower-priority footer segments are dropped first on narrow terminals
- **Interactive Settings** — `/pi-tui` opens General, Appearance, and Footer settings; `/pi-tui reload` reloads the JSON config

## Installation

Once published:

```bash
pi install @runecraft/pi-tui
```

For local development:

```bash
cd packages/pi-tui
npm link
pi -e ./extensions/pi-tui/index.ts
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
      "runtime": true,
      "contextBar": true,
      "model": true,
      "thinking": true,
      "tokens": true,
      "cost": true,
      "extStatus": true
    },
    "git": { "showBranch": true, "showStatus": true, "showCommit": false },
    "context": { "showBar": true, "showCompact": false },
    "tokens": { "showInput": true, "showOutput": true, "showCache": true }
  },
  "icons": { "mode": "auto", "custom": {} }
}
```

`icons.mode` accepts `auto`, `nerd`, or `ascii`. `ascii` disables Nerd Font prefixes while retaining the existing text markers. `icons.custom` is a compatibility-wide override map; segment-specific settings take precedence.

### Icon options

Header icons are configured under `header.icons`: `version`, `model`, `skills`, `prompts`, `extensions`, and `cwd`.

Footer icon options are configured on the matching footer object:

| Segment | Config key |
| --- | --- |
| Git branch/status/commit | `footer.git.icon` |
| Timer | `footer.timer.icon` |
| Runtime | `footer.runtime.icon` |
| Context bar | `footer.context.icon` |
| Model | `footer.model.icon` |
| Thinking | `footer.thinking.icon` |
| Token input/output/cache | `footer.tokens.inputIcon`, `outputIcon`, `cacheIcon` |
| Cost | `footer.cost.icon` |
| Extension status | `footer.extStatus.icon` |

Set any icon to `""` to suppress it.

### Footer segments

| Segment | Description |
| --- | --- |
| `cwd` | Current working directory |
| `timer` | Session elapsed timer |
| `gitBranch` | Current branch |
| `gitStatus` | Working-tree and ahead/behind indicators |
| `gitCommit` | Short latest commit and tag when configured |
| `runtime` | Session uptime |
| `contextBar` | Context usage visualization |
| `model` | Current model |
| `thinking` | Current thinking level |
| `tokens` | Input, output, and cache usage |
| `cost` | Session cost |
| `extStatus` | Extension status values |

The default footer packs line 1 as `cwd`, Git segments, and runtime, then appends the full-width context bar. Line 2 contains model, thinking, tokens, cost, and extension status. Priority order is defined by `FOOTER_PRIORITY` in `extensions/pi-tui/footer/index.ts`.

## Settings

Run `/pi-tui` to open the settings dialog. **Tab** / **←** / **→** switch tabs, **↑** / **↓** navigate, **Space** toggles values, **Enter** cycles footer zones, and **Esc** / **q** closes the dialog.

## License

MIT
