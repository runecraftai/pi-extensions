// Test-only policies, not an implementation or copy of pi-async-compaction.
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

const scenario = process.env.PI_LIFECYCLE_SCENARIO;
const mutation = process.env.PI_LIFECYCLE_MUTATION;
const trace = (event, data = {}) => process.stderr.write(`LIFECYCLE ${JSON.stringify({ event, ...data })}\n`);
const denyNetwork = () => {
  trace("network.forbidden");
  throw new Error("Lifecycle harness forbids network access");
};
globalThis.fetch = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
http.request = https.request = tls.connect = denyNetwork;

function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

export default function (pi) {
  const summaryGate = gate();
  const toolGate = gate();
  const force = ["A", "B", "E"].includes(scenario) || mutation === "abort";
  const resilience = ["A", "E", "G", "H"].includes(scenario);
  const sentinel = ["E", "F", "G", "J"].includes(scenario);
  const guardrail = ["C", "G"].includes(scenario);
  const background = ["A", "B", "D", "E", "H", "I", "J"].includes(scenario);
  let active = false;
  let workRequests = 0;
  let ready;
  let snapshot;
  let resumed = false;
  let boundaryApplied = false;
  let backgroundJob;
  let applyJob;

  // An in-process transport: no HTTP server, real credential, OAuth, or model service.
  const provider = {
    api: "lifecycle-fake-api",
    baseUrl: "http://network-forbidden.invalid",
    models: [{
      id: "scripted", name: "Lifecycle fake", reasoning: false, input: ["text"],
      contextWindow: 10000, maxTokens: 100,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const isBackground = context.messages.some((message) =>
        message.role === "user" && JSON.stringify(message.content).includes("BACKGROUND_SUMMARY"));
      const kind = isBackground ? "background" : options?.cacheRetention === "none" ? "native-summary" : "agent";
      if (kind === "agent" && active) workRequests++;
      trace("provider.request", { kind, model: `${model.provider}/${model.id}`, messages: context.messages.map((message) => ({
        role: message.role, toolCallId: message.toolCallId,
        toolCalls: Array.isArray(message.content) ? message.content.filter((block) => block.type === "toolCall").map((block) => block.id) : [],
        text: (typeof message.content === "string" ? message.content : JSON.stringify(message.content)).slice(0, 120),
      })) });
      void (async () => {
        const message = {
          role: "assistant", api: model.api, provider: model.provider, model: model.id,
          timestamp: Date.now(), content: [], stopReason: "pending",
          usage: { input: Math.ceil(JSON.stringify(context.messages).length / 4), output: 10, cacheRead: 0, cacheWrite: 0,
            totalTokens: Math.ceil(JSON.stringify(context.messages).length / 4) + 10,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        };
        try {
          await options?.onPayload?.({ kind, model: model.id });
          stream.push({ type: "start", partial: message });
          if (isBackground) await summaryGate.promise;
          if (options?.signal?.aborted) throw new Error("Fake request aborted");
          if (kind === "agent" && active && workRequests === 1) {
            message.content = [{ type: "toolCall", id: "slow-1", name: "slow", arguments: {} }];
            message.stopReason = "toolUse";
            stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
            stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: message.content[0], partial: message });
          } else {
            message.content = [{ type: "text", text: kind === "agent" ? "Finished." : "Synthetic summary." }];
            message.stopReason = "stop";
            stream.push({ type: "text_start", contentIndex: 0, partial: message });
            stream.push({ type: "text_delta", contentIndex: 0, delta: message.content[0].text, partial: message });
            stream.push({ type: "text_end", contentIndex: 0, content: message.content[0].text, partial: message });
          }
          stream.push({ type: "done", reason: message.stopReason, message });
        } catch (error) {
          message.stopReason = options?.signal?.aborted ? "aborted" : "error";
          message.errorMessage = String(error);
          stream.push({ type: "error", reason: message.stopReason, error: message });
        } finally {
          stream.end();
        }
      })();
      return stream;
    },
  };
  pi.registerProvider("lifecycle-fake", { ...provider, apiKey: "not-a-real-credential" });
  pi.registerProvider("lifecycle-keyless", provider);

  const settings = (ctx, legacy = false) => SettingsManager.create(ctx.cwd, process.env.PI_CODING_AGENT_DIR)
    .getCompactionSettings(legacy ? undefined : ctx.model);

  async function startBackground(ctx) {
    snapshot = {
      settings: settings(ctx, mutation === "settings"),
      firstKeptEntryId: ctx.sessionManager.getBranch().findLast((entry) =>
        entry.type === "message" && entry.message.role === "assistant").id,
    };
    trace("summary.started", { settings: snapshot.settings, idle: ctx.isIdle() });
    if (scenario === "I") {
      // Reproduce the upstream credential preflight, even for a keyless local provider.
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.modelRegistry.find("lifecycle-keyless", "scripted"));
      if (!auth.apiKey && !auth.headers) {
        trace("summary.failed", { error: "No API key or headers for lifecycle-keyless" });
        return;
      }
      throw new Error("The isolated fake provider unexpectedly has credentials");
    }
    const response = await ctx.modelRegistry.complete(ctx.model, {
      messages: [{ role: "user", content: "BACKGROUND_SUMMARY", timestamp: Date.now() }],
    });
    ready = response;
    trace("summary.ready", { idle: ctx.isIdle() });
    if (force) {
      trace("ctx.abort");
      await ctx.abort();
      await new Promise((resolve, reject) => ctx.compact({ onComplete: resolve, onError: reject }));
    }
  }

  pi.registerTool({
    name: "slow", label: "Slow fake tool", description: "Controlled signal-aware test tool",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute(toolCallId, _params, signal, _onUpdate, ctx) {
      trace("tool.started", { toolCallId });
      if (background) {
        backgroundJob = startBackground(ctx);
        backgroundJob.catch((error) => trace("fixture.error", { error: String(error) }));
      }
      const aborted = await new Promise((resolve) => {
        const onAbort = () => resolve(true);
        if (signal?.aborted) return resolve(true);
        signal?.addEventListener("abort", onAbort, { once: true });
        void toolGate.promise.then(() => { signal?.removeEventListener("abort", onAbort); resolve(false); });
      });
      trace("tool.finished", { toolCallId, aborted });
      if (aborted) throw new Error("Operation aborted");
      return { content: [{ type: "text", text: "tool-output ".repeat(2000) }], details: { aborted: false } };
    },
  });

  for (const event of ["agent_start", "turn_start", "turn_end", "agent_end", "agent_before_settle", "agent_settled"]) {
    pi.on(event, () => trace(event));
  }
  pi.on("tool_result", (event) => trace("tool_result", { toolCallId: event.toolCallId, isError: event.isError }));
  pi.on("session_before_compact", (event) => {
    trace("session_before_compact", { reason: event.reason, settings: event.preparation.settings });
    if (sentinel && event.reason !== "manual") trace("busy", { state: "busy", activity: "compaction" });
    if (!ready) return;
    const effective = event.preparation.settings;
    if (snapshot.settings.reserveTokens !== effective.reserveTokens || snapshot.settings.keepRecentTokens !== effective.keepRecentTokens) {
      trace("summary.invalidated", { reason: "SETTINGS_CHANGED" });
      ready = undefined;
      return;
    }
    trace("summary.handed_off");
    const result = { compaction: {
      summary: ready.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"),
      firstKeptEntryId: snapshot.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore, usage: ready.usage,
      details: { lifecycleFixture: true },
    } };
    ready = undefined;
    return result;
  });
  pi.on("session_compact", (event) => {
    trace("session_compact", { fromExtension: event.fromExtension });
    if (force && event.fromExtension) {
      setImmediate(() => {
        trace("resume", { source: "async", text: "continue" });
        pi.sendUserMessage("continue");
      });
    }
  });
  pi.on("session_compact_failed", (event) => trace("session_compact_failed", { ...event }));
  if (sentinel) {
    pi.on("agent_start", () => trace("busy", { state: "busy", activity: "agent-start" }));
    pi.on("agent_settled", () => trace("busy", { state: "idle", activity: "agent-settled" }));
  }
  if (guardrail) pi.on("tool_call", (_event, ctx) => {
    trace("guardrail.blocked", { percent: ctx.getContextUsage()?.percent });
    // Do not await: compact() aborts and waits for this hook's run to finish.
    applyJob = new Promise((resolve, reject) => ctx.compact({ onComplete: resolve, onError: reject }));
    applyJob.catch((error) => trace("fixture.error", { error: String(error) }));
    return { block: true, reason: "Synthetic 60% guardrail" };
  });
  if (scenario === "H") pi.on("turn_end", () => {
    if (!ready || boundaryApplied) return;
    boundaryApplied = true;
    trace("boundary.compaction");
    return { entries: [{
      type: "compaction", summary: "Synthetic boundary summary.",
      firstKeptEntryId: snapshot.firstKeptEntryId, tokensBefore: 10000,
    }], continue: true };
  });
  if (resilience) pi.on("agent_before_settle", (_event, ctx) => {
    if (resumed || !ctx.sessionManager.getBranch().some((entry) => entry.type === "compaction")) return;
    resumed = true;
    trace("resume", { source: "resilience", text: "Context was compacted. Continue your work." });
    pi.sendUserMessage("Context was compacted. Continue your work.", { deliverAs: "steer" });
  });

  pi.registerCommand("harness-work", { description: "Arm the scripted turn", handler: async () => {
    active = true;
    trace("fixture.armed");
  } });
  pi.registerCommand("harness-summary", { description: "Complete the background summary", handler: async () => {
    summaryGate.resolve();
  } });
  pi.registerCommand("harness-release", { description: "Finish the controlled tool", handler: async () => {
    toolGate.resolve();
  } });
  pi.registerCommand("harness-drain", { description: "Await outstanding fixture operations", handler: async () => {
    await backgroundJob;
    await applyJob;
    trace("fixture.drained");
  } });
  pi.on("session_start", () => trace("fixture.loaded", { scenario }));
}
