import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/core/canonicalJson.js";

describe("canonicalJson", () => {
	it("normalizes object key order", () => {
		expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
	});
});
