# @runecraft/pi-tui

Customizable TUI extension for [pi](https://pi.dev) — header, footer, editor, and context view in one configurable package.

## Features

- **Animated Logo** — 14-frame animation with 9-color palette, IBM stripes, and Minecraft gradient support
- **Info Bar** — Displays pi version, model, thinking effort, and system stats
- **Tips Panel** — Random command suggestions to improve discoverability
- **Starship-style Footer** — 2-line footer with CWD, git branch, runtime, context bar, model, tokens, and extension status
- **Full-width Footer** — Segments are left-packed; the context bar or filler stretches to consume remaining width so the footer reaches the right edge
- **Interactive Settings UI** — `/pi-tui` opens a tabbed settings dialog (General / Appearance / Footer)
- **Config System** — JSON schema with load/save/defaults at `~/.pi/agent/pi-tui.json`
- **/pi-tui reload** — Hot-reload configuration without restarting pi

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

## Usage

### Interactive Settings

Run `/pi-tui` to open the settings dialog. Use **Tab** / **←** / **→** to switch between tabs, **↑** / **↓** to navigate, and **Enter** / **Space** to toggle values. Press **Esc** or **q** to close.

**Tabs:**
- **General** — Enable/disable the extension, header, and footer
- **Appearance** — Icon mode (Auto / Nerd / ASCII), cursor style, context bar options
- **Footer** — Toggle individual footer segments (CWD, git branch, runtime, context bar, model, thinking, tokens, extension status)

### Configuration

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
    "context": {
      "showBar": true,
      "showCompact": false
    }
  },
  "icons": {
    "mode": "auto"
  }
}
```

### Reload

```bash
/pi-tui reload
```

### Settings Options

| Option | Values | Notes |
| --- | --- | --- |
| `enabled` | `true` / `false` | Master switch for the extension |
| `header.enabled` | `true` / `false` | Show/hide the header |
| `footer.enabled` | `true` / `false` | Show/hide the footer |
| `icons.mode` | `auto`, `nerd`, `ascii` | Controls icon rendering |
| `editor.cursorStyle` | `block`, `bar`, `underline` | Editor cursor style |
| `footer.segments.*` | `true` / `false` | Individual footer segment toggles |
| `footer.zones.*` | `left`, `center`, `right` | Zone assignment per segment |
| `footer.context.showBar` | `true` / `false` | Full context bar in footer |
| `footer.context.showCompact` | `true` / `false` | Compact context fallback |

### Footer Segments

| Segment | Description |
| --- | --- |
| `cwd` | Current working directory (truncated to fit) |
| `gitBranch` | Current git branch |
| `runtime` | Detected runtime version |
| `contextBar` | Context usage bar with percentage and token counts |
| `model` | Current model name and provider |
| `thinking` | Current thinking level |
| `tokens` | Token usage summary |
| `extStatus` | Extension status line |

## Footer Layout

The footer uses a **three-zone layout**: each line is divided into LEFT, CENTER, and RIGHT zones. Segments are assigned to zones via `footer.zones` in the config.

- **LEFT zone** renders from the left edge
- **CENTER zone** sits in the middle
- **RIGHT zone** renders flush to the right edge

Zones with no content take no space. Adjacent active zones are separated by ` · `.

```
📁 ~/project · 🔀 main · ⬢ v22.0.0  ·  📊 [████░░░░] 65.2%  ·  🤖 claude · ⬆ 12k/200k
```

Default zone assignments:

| Zone | Segments |
| --- | --- |
| Left | cwd, timer, git branch/status/commit, runtime |
| Center | context bar |
| Right | model, thinking, tokens, cost, extension status |

Zones are configurable in the JSON config and via the `/pi-tui` settings dialog (Footer tab — Enter cycles the zone for the selected segment).

When the terminal is narrow, segments are degraded in priority order:

1. Extension status (lowest priority — dropped first)
2. Git commit, git status, runtime
3. Timer, thinking, tokens, cost
4. Git branch, context bar, CWD, model (highest priority — last to drop)

## Planned Phases

- **Phase 3** — Editor customization
- **Phase 4** — Context view and advanced stats
- **Phase 5** — Turn telemetry (TPS, TTFT, stalls)

## License

MIT
