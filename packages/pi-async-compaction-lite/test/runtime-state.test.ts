import { describe, test } from "node:test";
import { expect } from "expect";
import { InvalidationReason } from "../src/constants.ts";
import { getAbortInvalidationReason } from "../src/runtime-state.ts";

describe("runtime state helpers", () => {
	test("reports timeout aborts distinctly from lifecycle cancellation", () => {
		expect(getAbortInvalidationReason(true)).toBe(InvalidationReason.TIMEOUT);
		expect(getAbortInvalidationReason(false)).toBe(InvalidationReason.CANCELLED);
	});
});
