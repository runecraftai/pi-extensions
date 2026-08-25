# @runecraft/pi-tui

Customizable TUI extension for [pi](https://pi.dev) — header, footer, editor, and context view in one configurable package.

## Features

### Phase 1 — Header
- **Animated Logo** — 14-frame animation with 9-color palette, IBM stripes, and Minecraft gradient support
- **Info Bar** — Displays pi version, model, thinking effort, and system stats
- **Tips Panel** — Random command suggestions to improve discoverability
- **Config System** — JSON schema with load/save/defaults at `~/.pi/agent/pi-tui.json`
- **/tui reload** — Hot-reload configuration without restarting pi

### Phase 2 — Footer (Implemented)
- **Configurable Segments** — Customize footer layout with multiple segment types
- **Git Info** — Display branch, commit hash, and status
- **Session Metrics** — Timer, runtime uptime, token usage, and cost
- **Context Bar** — Optional separator line for layout options
- **Graceful Fallbacks** — All renderers handle unavailable git/context/time data

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
    "line1": { "segments": ["cwd", "timer", "git", "runtime", "context_bar"] },
    "line2": { "segments": ["model", "thinking", "tokens", "cost", "ext_status"] },
    "git": { "showBranch": true, "showStatus": true, "showCommit": false },
    "context": { "showBar": true, "showCompact": false },
    "tokens": { "showInput": true, "showOutput": true, "showCache": true },
    "telemetry": { "enabled": false, "tps": true, "ttft": true, "stalls": true }
  }
}
```

### Available Footer Segments

- `cwd` — Current working directory with git branch
- `timer` — Session elapsed time
- `git` — Git branch and commit info
- `runtime` — Process uptime since session start
- `context_bar` — Visual separator line (when showBar enabled)
- `separator` — Pipe character `│`
- `stale_runtime` — Time since data was last updated
- `model` — Current model name
- `thinking` — Thinking/reasoning level
- `tokens` — Token usage statistics (input, output, cache)
- `cost` — Token cost estimate
- `ext_status` — Extension status messages

Reload with `/tui reload` to apply changes.

## Runtime Dependencies

pi-tui accesses some undocumented runtime properties from pi's ExtensionContext:

- **`ctx.session.usage`** — Token usage stats (input, output, cacheRead, cacheWrite, cost). pi's typed API only exposes `getContextUsage()` for context window percentages, not per-message breakdowns. This dependency includes graceful fallback if the property is absent.

If pi adds typed APIs for these features in the future, pi-tui will migrate to them.

## Planned Phases

- **Phase 3** — Editor customization
- **Phase 4** — Context view and advanced stats

## License

MIT
