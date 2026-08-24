<div align="center">

# @runecraft/graphify-pi

Minimal knowledge-graph extension for [Pi](https://pi.dev)

</div>

> Query your codebase's knowledge graph from inside Pi — five tools, zero config, 83% fewer tokens.

---

## What it does

`@runecraft/graphify-pi` wraps the [graphify](https://github.com/Graphify-Labs/graphify) CLI as a Pi extension. It registers five tools that let your coding agent query, traverse, explain, and build a codebase knowledge graph instead of grepping raw files.

| Tool | What it does |
|------|-------------|
| `graphify_build` | Build the knowledge graph from your codebase (run first) |
| `graphify_query` | BFS subgraph around concepts matching a natural-language question |
| `graphify_path` | Shortest path between two nodes (fuzzy match) |
| `graphify_explain` | Plain-language explanation of one node and its neighbors |
| `graphify_update` | Incrementally re-extract changed files (AST-only, no LLM cost) |

## Install

### Via Pi (recommended)

```bash
pi install npm:@runecraft/graphify-pi
```

### Manual with `-e` flag

Clone the repo and point Pi at the extension directly:

```bash
git clone https://github.com/runecraftai/pi-extensions.git
pi -e pi-extensions/packages/graphify-pi
```

Or for a single-session test:

```bash
pi -e /path/to/pi-extensions/packages/graphify-pi
```

### As a project extension

Add to your project's `.pi/extensions/` directory:

```bash
cp -r /path/to/pi-extensions/packages/graphify-pi ./graphify-pi
pi  # auto-discovers .pi/extensions/graphify-pi/
```

## Requirements

- **[graphify](https://github.com/Graphify-Labs/graphify)** CLI on `PATH` (or set `GRAPHIFY_BIN`)
  ```bash
  uv tool install graphifyy
  ```
- **Node.js** ≥ 20
- **Pi** with extension support

> **Note:** graphify-pi requires the graphify CLI to function. If the CLI is not found, you'll see a warning at session start with installation instructions.

## Configuration

All configuration via environment variables — no config files:

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAPHIFY_BIN` | `graphify` | Path to the graphify binary |
| `GRAPHIFY_BUDGET` | `2000` | Default token cap for `graphify_query` results |
| `GRAPHIFY_STALE_COMMITS` | `1` | Commits newer than graph before staleness notification |
| `GRAPHIFY_MAX_OUTPUT` | `1048576` (1 MiB) | Max bytes from CLI stdout+stderr before truncation |

## How it works

```
session_start
  ├─ graphify CLI available?
  │   ├─ no  → warn "install with: uv tool install graphifyy"
  │   └─ yes → continue
  ├─ graphify-out/graph.json exists?
  │   ├─ yes → register 5 tools + check staleness
  │   └─ no  → register tools (user can run graphify_build)
  └─ staleness check: git rev-list --count HEAD --since=<mtime>
       └─ count > threshold → notify "graph is N commits stale"
```

Tools shell out to the `graphify` CLI with a 60s timeout and bounded output capture. No extraction logic is reimplemented — every call delegates to the pinned binary.

## Quick start

1. Install graphify: `uv tool install graphifyy`
2. Install the extension: `pi install npm:@runecraft/graphify-pi`
3. Open Pi in your project
4. Run: `graphify_build` (or let the extension auto-detect an existing graph)
5. Query: `graphify_query "how does authentication work?"`

## License

[MIT](LICENSE) — © 2026 Runecraft AI
