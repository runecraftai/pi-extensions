// Lane pairs come from configuration only; the package names no vendor models.
import { existsSync, readFileSync } from "node:fs";

export interface ModelRef {
	provider: string;
	id: string;
}

export interface LanePair {
	/** Virtual model id, listed as `<provider>/<id>`. */
	id: string;
	name: string;
	strong: ModelRef;
	cheap: ModelRef;
}

export interface LaneConfig {
	provider: string;
	pairs: LanePair[];
}

export const DEFAULT_PROVIDER = "lanes";
const SLUG = /^[A-Za-z0-9._-]{1,64}$/;

export function formatRef(ref: ModelRef): string {
	return `${ref.provider}/${ref.id}`;
}

/** `provider/model-id`; the model id may itself contain slashes. */
export function parseRef(value: unknown, where: string): ModelRef {
	if (typeof value !== "string") throw new Error(`${where} must be a "provider/model-id" string`);
	const slash = value.indexOf("/");
	if (slash <= 0 || slash === value.length - 1) throw new Error(`${where} must be a "provider/model-id" string, got "${value}"`);
	return { provider: value.slice(0, slash), id: value.slice(slash + 1) };
}

export function parseConfig(raw: unknown): LaneConfig {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("config must be a JSON object");
	const { provider = DEFAULT_PROVIDER, pairs } = raw as { provider?: unknown; pairs?: unknown };
	if (typeof provider !== "string" || !SLUG.test(provider)) throw new Error("provider must match [A-Za-z0-9._-]");
	if (!Array.isArray(pairs) || pairs.length === 0) throw new Error("pairs must be a non-empty array");
	const seen = new Set<string>();
	const parsed = pairs.map((pair, i) => {
		const where = `pairs[${i}]`;
		if (!pair || typeof pair !== "object") throw new Error(`${where} must be an object`);
		const { id, name, strong, cheap } = pair as Record<string, unknown>;
		if (typeof id !== "string" || !SLUG.test(id)) throw new Error(`${where}.id must match [A-Za-z0-9._-]`);
		if (seen.has(id)) throw new Error(`${where}.id "${id}" is not unique`);
		seen.add(id);
		if (name !== undefined && typeof name !== "string") throw new Error(`${where}.name must be a string`);
		const strongRef = parseRef(strong, `${where}.strong`);
		const cheapRef = parseRef(cheap, `${where}.cheap`);
		if (strongRef.provider === provider) throw new Error(`${where}.strong cannot be a model of the router's own provider "${provider}"`);
		if (cheapRef.provider === provider) throw new Error(`${where}.cheap cannot be a model of the router's own provider "${provider}"`);
		return {
			id,
			name: name || `Lanes: ${formatRef(strongRef)} plans, ${formatRef(cheapRef)} builds`,
			strong: strongRef,
			cheap: cheapRef,
		};
	});
	return { provider, pairs: parsed };
}

export type LoadedConfig = { status: "ok"; config: LaneConfig } | { status: "missing"; path: string } | { status: "invalid"; path: string; error: string };

export function loadConfig(path: string): LoadedConfig {
	if (!existsSync(path)) return { status: "missing", path };
	try {
		return { status: "ok", config: parseConfig(JSON.parse(readFileSync(path, "utf8"))) };
	} catch (error) {
		return { status: "invalid", path, error: error instanceof Error ? error.message : String(error) };
	}
}
