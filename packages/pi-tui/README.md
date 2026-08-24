# @runecraft/pi-tui

Customizable TUI extension for [pi](https://pi.dev) — header, footer, editor, and context view in one configurable package.

## Phase 1 Features

- **Animated Logo** — 14-frame animation with 9-color palette, IBM stripes, and Minecraft gradient support
- **Info Bar** — Displays pi version, model, thinking effort, and system stats
- **Tips Panel** — Random command suggestions to improve discoverability
- **Config System** — JSON schema with load/save/defaults at `~/.pi/agent/pi-tui.json`
- **/tui reload** — Hot-reload configuration without restarting pi

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
  }
}
```

Reload with `/tui reload` to apply changes.

## Planned Phases

- **Phase 2** — Footer configuration and telemetry
- **Phase 3** — Editor customization
- **Phase 4** — Context view and advanced stats

## License

MIT
