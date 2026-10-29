import { describe, test } from "node:test";
import { expect } from "expect";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BUILTIN_ADAPTER_ID, EXTENSION_NAME } from "../src/constants.ts";
import { applyReadyCompaction, startAsyncJobWithDeps } from "../src/job.ts";
import { createRuntimeState } from "../src/runtime-state.ts";
import { asyncJobContext, asyncJobDeps, compactableEntries, readyJob, settings } from "./test-fixtures.ts";

const builtinJobId = `${EXTENSION_NAME}:${BUILTIN_ADAPTER_ID}:1`;


describe("startAsyncJob lifecycle", () => {
	test("does not start when disabled", () => {
		const state = createRuntimeState();

		startAsyncJobWithDeps(asyncJobContext(compactableEntries()), state, asyncJobDeps({ isEnabled: () => false }));

		expect(state.status).toBe("idle");
		expect(state.jobId).toBeUndefined();
	});

	test("sets cli status line while a background job is pending", () => {
		const state = createRuntimeState();
		const never = new Promise<never>(() => {});
		const statusValues: Array<string | undefined> = [];

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				buildAsyncCompactionResult: () => never,
				setCliStatus: (_ctx, _statusKey, text) => statusValues.push(text),
			}),
		);

		expect(state.status).toBe("pending");
		expect(state.jobId).toBe(builtinJobId);
		expect(statusValues).toEqual(["built-in Pi compaction: preparing"]);
	});

	test("namespaces pending job ids and status by adapter identity and label", () => {
		const state = createRuntimeState("partner.adapter", "partner compaction");
		const never = new Promise<never>(() => {});
		const statusValues: Array<{ readonly key: string; readonly text: string | undefined }> = [];

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({
				buildAsyncCompactionResult: () => never,
				setCliStatus: ((_: unknown, key: string, text: string | undefined) => statusValues.push({ key, text })) as Parameters<typeof startAsyncJobWithDeps>[2]["setCliStatus"],
			}),
		);

		expect(state.jobId).toBe("runecraft-async-compaction:partner.adapter:1");
		expect(statusValues).toEqual([{ key: "runecraft-async-compaction:partner.adapter", text: "partner compaction: preparing" }]);
	});

	test("starts a pending job below the async threshold when forced", () => {
		const state = createRuntimeState();
		const never = new Promise<never>(() => {});

		const outcome = startAsyncJobWithDeps(
			asyncJobContext(compactableEntries(), 100),
			state,
			asyncJobDeps({ buildAsyncCompactionResult: () => never }),
			{ force: true },
		);

		expect(outcome).toBe("started");
		expect(state.status).toBe("pending");
		expect(state.jobId).toBe(builtinJobId);
	});

	test("does not auto-start when reserve leaves no start window", () => {
		const state = createRuntimeState();
		let buildCalls = 0;

		const outcome = startAsyncJobWithDeps(
			asyncJobContext(compactableEntries(), 30_000, 32_000),
			state,
			asyncJobDeps({
				buildAsyncCompactionResult: async (preparation) => {
					buildCalls++;
					return {
						summary: "async summary",
						firstKeptEntryId: preparation.firstKeptEntryId,
						tokensBefore: preparation.tokensBefore,
						details: { readFiles: [], modifiedFiles: [] },
					};
				},
				getCompactionSettings: () => ({ ...settings, reserveTokens: 16_384 }),
			}),
		);

		expect(outcome).toBe("start_window_empty");
		expect(state.status).toBe("idle");
		expect(buildCalls).toBe(0);
	});

	test("clears cli status line when a background job becomes ready", async () => {
		const state = createRuntimeState();
		const statusValues: Array<string | undefined> = [];

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries()),
			state,
			asyncJobDeps({ setCliStatus: (_ctx, _statusKey, text) => statusValues.push(text) }),
		);
		await Promise.resolve();

		expect(state.status).toBe("ready");
		expect(state.ready?.result.summary).toBe("async summary");
		expect(state.ready?.result.details?.asyncPrefixCompaction.jobId).toBe(builtinJobId);
		expect(statusValues).toEqual(["built-in Pi compaction: preparing", undefined]);
	});

	test("triggers Pi compaction when a background job becomes ready while idle", async () => {
		const state = createRuntimeState();
		let compactTriggered = 0;

		startAsyncJobWithDeps(
			{
				...asyncJobContext(compactableEntries()),
				isIdle: () => true,
				hasPendingMessages: () => false,
			},
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);
		await Promise.resolve();

		expect(compactTriggered).toBe(1);
	});

	test("does not trigger Pi compaction when a background job becomes ready during an active turn without an abortable signal", async () => {
		const state = createRuntimeState();
		let compactTriggered = 0;

		startAsyncJobWithDeps(
			{
				...asyncJobContext(compactableEntries()),
				isIdle: () => false,
				hasPendingMessages: () => false,
			},
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);
		await Promise.resolve();

		expect(state.status).toBe("ready");
		expect(compactTriggered).toBe(0);
	});

	test("waits for native compaction even if host offers a deferred checkpoint", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = builtinJobId;
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: builtinJobId,
			snapshotLeafId: "u2",
		};
		let requestCount = 0;
		let abortCalls = 0;
		let compactTriggered = 0;

		const applied = applyReadyCompaction(
			{
				...asyncJobContext(compactableEntries()),
				isIdle: () => false,
				hasPendingMessages: () => false,
				signal: new AbortController().signal,
				abort: () => abortCalls++,
				requestCompactionBeforeNextTurn: () => {
					requestCount++;
					return true;
				},
			} as unknown as ExtensionContext,
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);

		expect(applied).toBe(false);
		expect(requestCount).toBe(0);
		expect(abortCalls).toBe(0);
		expect(compactTriggered).toBe(0);
		expect(state.applyInFlight).toBeUndefined();
	});

	test("preserves a reusable ready job without scheduling a checkpoint", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = builtinJobId;
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: builtinJobId,
			snapshotLeafId: "u2",
		};
		let requestCount = 0;

		const outcome = startAsyncJobWithDeps(
			{
				...asyncJobContext(compactableEntries()),
				isIdle: () => false,
				hasPendingMessages: () => false,
				requestCompactionBeforeNextTurn: () => {
					requestCount++;
					return true;
				},
			} as unknown as ExtensionContext,
			state,
			asyncJobDeps(),
		);

		expect(outcome).toBe("ready_reused");
		expect(requestCount).toBe(0);
		expect(state.applyInFlight).toBeUndefined();
	});

	test("does not fall back to abort when a checkpoint is unavailable", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = builtinJobId;
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: builtinJobId,
			snapshotLeafId: "u2",
		};
		let abortCalls = 0;
		let compactTriggered = 0;

		const applied = applyReadyCompaction(
			{
				...asyncJobContext(compactableEntries()),
				isIdle: () => false,
				hasPendingMessages: () => false,
				signal: new AbortController().signal,
				abort: () => abortCalls++,
				requestCompactionBeforeNextTurn: () => false,
			} as unknown as ExtensionContext,
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);

		expect(applied).toBe(false);
		expect(abortCalls).toBe(0);
		expect(compactTriggered).toBe(0);
	});

	test("preserves an active agent above the async threshold", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = builtinJobId;
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: builtinJobId,
			snapshotLeafId: "u2",
		};
		let abortCalls = 0;
		let compactTriggered = 0;
		const signal = new AbortController().signal;

		const applied = applyReadyCompaction(
			{
				...asyncJobContext(compactableEntries()),
				isIdle: () => false,
				hasPendingMessages: () => false,
				signal,
				abort: () => abortCalls++,
			},
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);

		expect(applied).toBe(false);
		expect(abortCalls).toBe(0);
		expect(compactTriggered).toBe(0);
	});

	test("claims a ready job before triggering Pi compaction", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = builtinJobId;
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: builtinJobId,
			snapshotLeafId: "u2",
		};
		let compactTriggered = 0;
		const deps = asyncJobDeps({ triggerCompaction: () => compactTriggered++ });

		expect(applyReadyCompaction(asyncJobContext(compactableEntries()), state, deps)).toBe(true);
		expect(applyReadyCompaction(asyncJobContext(compactableEntries()), state, deps)).toBe(false);
		expect(compactTriggered).toBe(1);
	});

	test("does not force-stop an abortable active agent below the async threshold", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = builtinJobId;
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: builtinJobId,
			snapshotLeafId: "u2",
		};
		let abortCalls = 0;
		let compactTriggered = 0;
		const signal = new AbortController().signal;

		const applied = applyReadyCompaction(
			{
				...asyncJobContext(compactableEntries(), 800),
				isIdle: () => false,
				hasPendingMessages: () => false,
				signal,
				abort: () => abortCalls++,
			},
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);

		expect(applied).toBe(false);
		expect(abortCalls).toBe(0);
		expect(compactTriggered).toBe(0);
		expect(state.status).toBe("ready");
	});

	test("does not trigger Pi compaction when queued messages are pending", async () => {
		const state = createRuntimeState();
		let compactTriggered = 0;

		startAsyncJobWithDeps(
			{
				...asyncJobContext(compactableEntries()),
				isIdle: () => true,
				hasPendingMessages: () => true,
			},
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
		);
		await Promise.resolve();

		expect(state.status).toBe("ready");
		expect(compactTriggered).toBe(0);
	});

	test("manual force triggers Pi compaction when a reusable ready job already exists", () => {
		const state = createRuntimeState();
		state.status = "ready";
		state.jobId = builtinJobId;
		state.jobCounter = 1;
		state.ready = {
			...readyJob({ snapshotLeafId: "u2" }),
			jobId: builtinJobId,
			snapshotLeafId: "u2",
		};
		let compactTriggered = 0;

		startAsyncJobWithDeps(
			asyncJobContext(compactableEntries(), 100),
			state,
			asyncJobDeps({ triggerCompaction: () => compactTriggered++ }),
			{ force: true },
		);

		expect(compactTriggered).toBe(1);
	});
});
