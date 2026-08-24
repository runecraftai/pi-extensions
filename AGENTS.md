# Project agent memory

This file is the project's committed base for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Pi-tui Architecture Notes

**Config strategy:** The config system uses `deepMerge()` to combine user overrides with defaults. This means users can provide partial config objects (only the fields they customize), making the config forward-compatible when new fields are added. See `config.ts` for default values.

**Future config fields:** `footer.git.*`, `footer.tokens.*`, `footer.telemetry.*`, `editor.roundedBorders`, and `colors.overrides` are defined in the schema but not yet used—they're reserved for Phase 3+ features. Do not remove them.

**Footer rendering:** Segments use priority-based degradation for narrow terminals; see `footer/index.ts` PRIORITY constant. Line 1 includes CWD, git branch, runtime, and context bar; Line 2 includes model, thinking, tokens, and extension status.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
