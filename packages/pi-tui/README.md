# @runecraft/pi-tui

Customizable TUI extension for [pi](https://pi.dev) — header, footer, editor, and context view in one configurable package.

## Features

### Phase 1 — Header

- **Animated Logo** — 14-frame animation with 9-color palette, IBM stripes, and Minecraft gradient support
- **Info Bar** — Displays pi version, model, thinking effort, and system stats
- **Tips Panel** — Random command suggestions to improve discoverability
- **Config System** — JSON schema with load/save/defaults at `~/.pi/agent/pi-tui.json`
- **/tui reload** — Hot-reload configuration without restarting pi

### Phase 2 — Footer

- **Configurable Two-Line Footer** — Segments on line 1 (cwd, timer, git, context_bar) and line 2 (model, thinking, tokens, cost); extension statuses wrap onto additional rows
- **Context Zone Bar** — Visual context usage bar with smart/warm/dumb zone dividers at 40%/70% thresholds
- **Async Git Status** — Branch, ahead/behind, staged/modified/untracked/stashed counts with caching; invalidated on tool execution
- **Priority-Based Segment Fitting** — Segments compact then drop lowest-priority on narrow terminals
- **Icon Modes** — Auto-detect Nerd Font terminals; manual `nerd`/`ascii`/`auto` via `icons.mode`
- **Event-Driven Updates** — Refreshes on agent start/end, message end, tool execution, model/thinking changes

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

Create or edit `~/.pi/agent/pi-tui.json`:

```json
{
  "enabled": true,
  "header": {
    "enabled": true,
    "animateLogo": true,
    "logoColor": "c",
    "logoSpeed": 50,
    "ibmStripes": true,
    "minecraftGradient": true,
    "slogan": "Code something that makes you proud",
    "showSlogan": true,
    "sloganColor": true,
    "showVersion": true,
    "showModel": true,
    "showCwd": true,
    "showTips": true,
    "showStatsBar": true,
    "tipCount": 3
  },
  "footer": {
    "enabled": true,
    "line1": { "segments": ["cwd", "timer", "git", "context_bar"] },
    "line2": { "segments": ["model", "thinking", "tokens", "cost", "ext_status"] },
    "git": { "showBranch": true, "showStatus": true, "showCommit": false },
    "tokens": { "showInput": true, "showOutput": true, "showCache": true }
  },
  "icons": { "mode": "auto", "custom": {} },
  "colors": { "overrides": {} }
}
```

Available segment names: `cwd`, `timer`, `git`, `context_bar`, `context_pct`, `model`, `thinking`, `tokens`, `cost`, `ext_status`, `separator`, `text:<literal>`.

Reload with `/tui reload` to apply changes.

## Planned Phases

- **Phase 3** — Editor customization
- **Phase 4** — Context view and advanced stats

## License

MIT
