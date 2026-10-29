import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { buildAsyncCompactionResult } from "../src/job.ts";
import { prepareAsyncCompaction } from "../src/preparation.ts";
import { assertSupportedPi } from "../src/version.ts";
import { asyncJobContext, compactableEntries, settings } from "./test-fixtures.ts";

const retry = { enabled: false, maxRetries: 0, baseDelayMs: 0 };

test("background summaries use Pi's registry without reading credentials or changing routing", async () => {
  const base = asyncJobContext(compactableEntries());
  const preparation = prepareAsyncCompaction(compactableEntries(), settings)!;
  const signal = new AbortController().signal;
  let requests = 0;
  const ctx = {
    ...base,
    modelRegistry: {
      getApiKeyAndHeaders() { assert.fail("Package must not extract credentials"); },
      streamSimple(...[model, context, options]: Parameters<ExtensionContext["modelRegistry"]["streamSimple"]>) {
        requests++;
        assert.ok(options);
        assert.equal(model, base.model);
        assert.equal(options.signal, signal);
        assert.equal(options.apiKey, undefined);
        assert.equal(options.headers, undefined);
        assert.equal(options.env, undefined);
        assert.equal(options.cacheRetention, "none");
        assert.match(JSON.stringify(context.messages), /old prefix/);
        const stream = createAssistantMessageEventStream();
        stream.end({
          role: "assistant", api: model.api, provider: model.provider, model: model.id,
          content: [{ type: "text", text: "Registry summary" }], stopReason: "stop", timestamp: 0,
          usage: { input: 5, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 8,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        });
        return stream;
      },
    },
  } as unknown as ExtensionContext;
  const result = await buildAsyncCompactionResult(preparation, base.model!, ctx, "off", signal, undefined, () => retry);
  assert.equal(requests, 1);
  assert.match(result.summary, /Registry summary/);
  assert.equal(result.firstKeptEntryId, preparation.firstKeptEntryId);
  assert.equal(result.usage?.totalTokens, 8);
});

test("unsupported Pi releases fail loudly before enabling compaction", () => {
  for (const version of ["1.4.0", "1.4.99"]) assert.doesNotThrow(() => assertSupportedPi(version));
  for (const version of ["1.3.9", "1.5.0", "2.0.0", "1.4.0-preview", "unknown"]) {
    assert.throws(() => assertSupportedPi(version), /requires Pi >=1\.4\.0 <1\.5\.0; host is/);
  }
});
