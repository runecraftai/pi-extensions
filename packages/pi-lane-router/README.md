# @runecraft/pi-lane-router

A Pi virtual model that plans on a strong model and implements on a cheap one.
Every turn reports which model answered it, with its tokens and cost.

## How it routes

- **Plan phase.** A session starts on the strong lane.
- **Build phase.** After the first successful `edit` or `write` tool result in a turn, the next request goes to the cheap lane, and the session stays there.
- The phase is Pi router state (`pi.virtual-model-state` entries), so it follows the session tree and survives compaction.
- Compaction summaries and other requests outside the agent loop stay on the strong lane.

## Turn reports

After every turn on a lane model, the extension appends a `lane-router.turn`
session entry. The entry is rendered in the transcript and is not sent to the
model:

```json
{"v":1,"pair":"duo","turn":0,"phase":"plan","lane":"strong","model":"anthropic/claude-opus-4-5",
 "tokens":{"input":1200,"output":80,"cacheRead":300,"cacheWrite":0,"total":1580},
 "cost":{"input":0.012,"output":0.004,"cacheRead":0.0003,"cacheWrite":0,"total":0.0163},
 "stopReason":"toolUse"}
```

`lane` and `model` come from the assistant message, so they name the model that
actually answered. The footer status shows the phase, cost per lane, and whether
the cheap lane is unavailable. `/lane-router` prints the totals per lane for the
current branch.

## When the cheap lane is unavailable

The router never switches lanes silently. If the cheap model is missing from
the catalog, has no credentials, fails a request that Pi retries, or ends a
turn with an error such as quota exhaustion:

1. A `lane-router.unavailable` entry records the reason, and a warning is shown.
2. After a failed turn, a visible `lane-router.fallback` message tells the model the cheap lane is unavailable, and the task continues on the strong lane.
3. Every turn that the strong lane serves in its place includes a `fallback` field with the reason.

`/lane-router reset` marks the cheap lane available again. If the strong lane
is missing or has no credentials, the request fails with an error that names it.

## Configuration

Model pairs come only from configuration. The package names no vendor models.
Write `~/.pi/agent/pi-lane-router.json`, or set `PI_LANE_ROUTER_CONFIG` to
another path:

```json
{
  "provider": "lanes",
  "pairs": [
    { "id": "opus-haiku", "name": "Opus plans, Haiku builds", "strong": "anthropic/claude-opus-4-5", "cheap": "anthropic/claude-haiku-4-5" }
  ]
}
```

Each pair becomes a selectable model named `<provider>/<id>`, for example
`lanes/opus-haiku`. `provider` defaults to `lanes`, and `name` is optional.
Models are written as `provider/model-id`, the same names `/model` lists. When
the file is missing or invalid, no model is registered and a notice says why.

## Usage

```bash
pi -e ./packages/pi-lane-router --model lanes/opus-haiku
```

The package is private pending publication.

## Tests

```bash
npm test --workspace=@runecraft/pi-lane-router
```

`test/pi-lifecycle/surfaces.test.mjs` runs the package in a real Pi 1.4.0
process with two fake in-process models. It checks the plan-to-build switch, the
per-turn lane, token, and cost reports, and the quota fallback.
