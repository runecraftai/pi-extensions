import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { CompactionResult, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { InvalidationReason, JobStatus } from "./constants.ts";
import type { AsyncCompactionLifecycleObserver } from "./diagnostics.ts";

export interface AsyncCompactionMarker {
	readonly adapterId: string;
	readonly jobId: string;
	readonly snapshotLeafId: string;
	readonly modelKey: string;
	readonly thinkingLevel: ThinkingLevel;
	readonly settingsKey: string;
	readonly promptVersion: string;
}

export interface JobCorrelation {
	readonly adapterId: string;
	readonly jobId: string;
	readonly promptVersion: string;
}

// Protocol key kept for interoperability: details.asyncPrefixCompaction is persisted on compaction
// results so other consumers and Pi lifecycle hooks can detect the handoff.
export interface AsyncCompactionDetails {
	readonly asyncPrefixCompaction: AsyncCompactionMarker;
	readonly readFiles?: readonly string[];
	readonly modifiedFiles?: readonly string[];
}

export interface Snapshot {
	readonly jobId: string;
	readonly sessionId: string;
	readonly snapshotLeafId: string;
	readonly firstKeptEntryId: string;
	readonly modelKey: string;
	readonly thinkingLevel: ThinkingLevel;
	readonly settingsKey: string;
	readonly promptVersion: string;
}

export interface ReadyJob extends Snapshot {
	readonly adapterId: string;
	readonly result: CompactionResult<AsyncCompactionDetails>;
}

export interface FileOperations {
	readonly read: Set<string>;
	readonly written: Set<string>;
	readonly edited: Set<string>;
}

export type ResolvedCompactionSettings = ReturnType<SettingsManager["getCompactionSettings"]>;

export interface LocalCompactionPreparation {
	readonly firstKeptEntryId: string;
	readonly messagesToSummarize: AgentMessage[];
	readonly turnPrefixMessages: AgentMessage[];
	readonly isSplitTurn: boolean;
	readonly tokensBefore: number;
	readonly previousSummary?: string;
	readonly fileOps: FileOperations;
	readonly settings: ResolvedCompactionSettings;
}

export interface RuntimeState {
	readonly adapterId: string;
	readonly adapterLabel: string;
	status: JobStatus;
	jobId: string | undefined;
	ready: ReadyJob | undefined;
	reason: InvalidationReason | undefined;
	error: string | undefined;
	abortController: AbortController | undefined;
	jobCounter: number;
	applyInFlight: JobCorrelation | undefined;
	lastHandedOff: JobCorrelation | undefined;
	lifecycleObserver: AsyncCompactionLifecycleObserver | undefined;
	lifecycleStartedAtMs: number | undefined;
}
