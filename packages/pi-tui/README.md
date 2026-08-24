# @runecraft/pi-tui

Customizable TUI extension for [pi](https://pi.dev) — header, footer, editor, and context view in one configurable package.

## Phase 1 Features

- **Animated Logo** — 14-frame animation with 9-color palette, IBM stripes, and Minecraft gradient support
- **Info Bar** — Displays pi version, model, thinking effort, and system stats with configurable Nerd Font icons
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
    "tipCount": 3,
    "icons": {
      "version": "\u{F17C}",
      "model": "\u{EC19}",
      "skills": "\u{EB64}",
      "prompts": "\u{F15C}",
      "extensions": "\u{EB25}",
      "cwd": "\u{F07B}"
    }
  }
}
```

Reload with `/tui reload` to apply changes.

## Icon Configuration

Every segment in the info bar and footer has a configurable Nerd Font icon. Set a segment's icon to any string, or to `""` (empty string) to disable it.

### Header Icons

| Segment      | Config Key             | Default Icon | Description                    |
|--------------|------------------------|--------------|--------------------------------|
| Version      | `header.icons.version` | `         ` | Pi logo (nf-linux-pi)          |
| Model        | `header.icons.model`   | `         ` | Chip icon (nf-md-chip)         |
| Skills       | `header.icons.skills`  | `         ` | Directory icon (nf-oct-file_directory) |
| Prompts      | `header.icons.prompts` | `         ` | File text icon (nf-fa-file_text) |
| Extensions   | `header.icons.extensions` | `        ` | Package icon (nf-oct-package)  |
| CWD          | `header.icons.cwd`     | `         ` | Folder icon (nf-fa-folder)     |

### Footer Icons (planned)

Config support is available for footer icons; rendering is planned for a future phase.

| Segment        | Config Key                    | Default Icon | Description                      |
|----------------|-------------------------------|--------------|----------------------------------|
| Git            | `footer.git.icon`             | `         ` | Git icon (nf-fa-git)             |
| Timer          | `footer.timer.icon`           | `         ` | Clock icon (nf-fa-clock)         |
| Runtime        | `footer.runtime.icon`         | `         ` | Terminal icon (nf-fa-terminal)   |
| Context Bar    | `footer.context.icon`         | `         ` | Database icon (nf-dev-database)  |
| Model          | `footer.model.icon`           | `         ` | Chip icon (nf-md-chip)           |
| Thinking       | `footer.thinking.icon`        | `         ` | Brain icon (nf-fa-brain)         |
| Token Input    | `footer.tokens.inputIcon`     | `         ` | Sign-in icon (nf-fa-sign_in_alt) |
| Token Output   | `footer.tokens.outputIcon`    | `         ` | Sign-out icon (nf-fa-sign_out_alt) |
| Cache Hit      | `footer.tokens.cacheIcon`     | `         ` | Database icon (nf-fa-database)   |
| Cost           | `footer.cost.icon`            | `         ` | Dollar icon (nf-fa-dollar_sign)  |
| Ext Status     | `footer.extStatus.icon`       | `         ` | Package icon (nf-oct-package)    |

### Disabling Icons

Set any icon to `""` to suppress it:

```json
{
  "header": {
    "icons": {
      "version": "",
      "model": ""
    }
  }
}
```

## Default Icon Vocabulary

All default icons are Nerd Font glyphs sourced from the plugins this extension unifies:

- **pi-open-tui** (OldSuns) — footer segment icons: git, model, thinking, tokens, cost, cwd, timer, runtime, context
- **pi-vitals** (mcowger) — powerline segment icons: model, folder, repo, branch, context, tokens, cost, thinking
- **pi-cc-header** (eriiic7z) — header info bar: no explicit icons (plain text)

## Planned Phases

- **Phase 2** — Footer configuration and telemetry
- **Phase 3** — Editor customization
- **Phase 4** — Context view and advanced stats

## License

MIT
