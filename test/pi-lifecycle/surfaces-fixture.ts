// Fake provider and tools for the real-Pi checks of pi-lane-router and pi-decisions.
// Two in-process models (strong, cheap) with distinct, nonzero usage; no network.
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

const scenario = process.env.PI_SURFACES_SCENARIO;
const trace = (event, data = {}) => process.stderr.write(`SURFACES ${JSON.stringify({ ...data, event })}\n`);
const denyNetwork = () => {
  trace("network.forbidden");
  throw new Error("Surfaces harness forbids network access");
};
globalThis.fetch = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
http.request = https.request = tls.connect = denyNetwork;

const USAGE = {
  strong: { input: 1000, output: 50, cost: { input: 0.015, output: 0.00375 } },
  cheap: { input: 1000, output: 50, cost: { input: 0.0008, output: 0.0002 } },
};

const DECISION = {
  decisions: [{
    key: "merge-strategy", title: "Merge Strategy", question: "How should we merge the authentication fix PR?",
    options: [
      { id: "squash", label: "Squash & Merge", description: "Combine into one clean commit on main" },
      { id: "rebase", label: "Rebase & Merge", description: "Preserve both commits in history" },
    ],
    recommended: "squash",
  }],
};

export default function (pi) {
  const model = (id) => ({
    id, name: `Surfaces ${id}`, reasoning: false, input: ["text"], contextWindow: 100000, maxTokens: 1000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  });
  pi.registerProvider("surfaces-fake", {
    api: "surfaces-fake-api",
    baseUrl: "http://network-forbidden.invalid",
    apiKey: "not-a-real-credential",
    models: [model("strong"), model("cheap")],
    streamSimple(m, context) {
      const stream = createAssistantMessageEventStream();
      const last = context.messages.at(-1);
      trace("provider.request", { model: `${m.provider}/${m.id}`, last: last?.role });
      const u = USAGE[m.id];
      const message = {
        role: "assistant", api: m.api, provider: m.provider, model: m.id, timestamp: Date.now(), content: [], stopReason: "stop",
        usage: { input: u.input, output: u.output, cacheRead: 0, cacheWrite: 0, totalTokens: u.input + u.output,
          cost: { ...u.cost, cacheRead: 0, cacheWrite: 0, total: u.cost.input + u.cost.output } },
      };
      void (async () => {
        stream.push({ type: "start", partial: message });
        if (scenario === "quota" && m.id === "cheap") {
          message.stopReason = "error";
          message.errorMessage = "429 insufficient_quota: You exceeded your current quota";
          stream.push({ type: "error", reason: "error", error: message });
          stream.end();
          return;
        }
        const toolName = scenario === "decisions" || scenario === "operator" ? "ask_decisions" : "write";
        if (last?.role === "user" && !context.messages.some((msg) => msg.role === "toolResult")) {
          const args = toolName === "write" ? { path: "plan.txt", content: "plan" } : DECISION;
          message.content = [{ type: "toolCall", id: "call-1", name: toolName, arguments: args }];
          message.stopReason = "toolUse";
          stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
          stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: message.content[0], partial: message });
        } else {
          message.content = [{ type: "text", text: `Done on ${m.id}.` }];
          stream.push({ type: "text_start", contentIndex: 0, partial: message });
          stream.push({ type: "text_delta", contentIndex: 0, delta: message.content[0].text, partial: message });
          stream.push({ type: "text_end", contentIndex: 0, content: message.content[0].text, partial: message });
        }
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end();
      })();
      return stream;
    },
  });

  pi.registerTool({
    name: "write", label: "Fake write", description: "Pretend to write a file",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, additionalProperties: false },
    async execute() {
      trace("tool.write");
      return { content: [{ type: "text", text: "wrote plan.txt" }], details: {} };
    },
  });

  pi.on("tool_result", (event) => trace("tool_result", { toolName: event.toolName, details: event.details, isError: event.isError }));
  pi.on("agent_settled", () => trace("agent_settled"));
  pi.on("session_start", () => trace("fixture.loaded"));
}
