// The hash chain depends on canonical JSON being byte-identical across
// processes. We sort object keys explicitly here, and rely on V8 (Node)
// preserving the insertion order of string keys when JSON.stringify
// serializes — guaranteed by the ECMA-262 spec for string property keys.
// Do NOT introduce keys that are numeric strings ("0", "1", …) into
// payloads: those are reordered by JS object semantics and would silently
// desync the hash from the sorted intent.
export function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, canonicalize(v)]),
		);
	}
	return value;
}

export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}
