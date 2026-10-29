import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBuiltinPiCompactionAdapter } from "./adapter.ts";
import { registerAsyncCompaction } from "./core.ts";
import type { AsyncCompactionCoreDependencies } from "./core.ts";
import { buildAsyncCompactionResult } from "./job.ts";

export default function asyncPrefixCompaction(
	pi: ExtensionAPI,
	injectedDeps: Partial<AsyncCompactionCoreDependencies> = {},
): void {
	registerAsyncCompaction(
		pi,
		createBuiltinPiCompactionAdapter(buildAsyncCompactionResult),
		{ commandName: "async-compact-now" },
		injectedDeps,
	);
}
