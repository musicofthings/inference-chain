import { ALL_INSTALL_TARGETS, targetsForDetect } from "./detect.js";
import { AGENT_TARGETS, type AgentTarget, isAgentTarget } from "./types.js";

export type InstallPlan =
	| { mode: "targets"; targets: AgentTarget[] }
	| {
			mode: "detect";
			targets: AgentTarget[];
			detected: ReturnType<typeof targetsForDetect>["detected"];
			fallback: boolean;
	  }
	| { mode: "all"; targets: AgentTarget[] };

/**
 * Parse `--target` values: single id, comma-separated list, or the aliases
 * `all` / `detect` (same as --all / --detect flags).
 */
export function parseTargetOption(raw: string): InstallPlan {
	const trimmed = raw.trim();
	if (trimmed === "all") {
		return { mode: "all", targets: [...ALL_INSTALL_TARGETS] };
	}
	if (trimmed === "detect") {
		const d = targetsForDetect();
		return {
			mode: "detect",
			targets: d.targets,
			detected: d.detected,
			fallback: d.fallback,
		};
	}

	const parts = trimmed
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean);
	if (parts.length === 0) {
		throw new Error(
			`Empty --target. Choose one of: ${AGENT_TARGETS.join(", ")}, or all | detect`,
		);
	}

	const targets: AgentTarget[] = [];
	for (const part of parts) {
		if (part === "all" || part === "detect") {
			throw new Error(
				`Cannot mix "${part}" with other --target values. Use --all / --detect alone.`,
			);
		}
		if (!isAgentTarget(part)) {
			throw new Error(
				`Unknown --target "${part}". Choose one of: ${AGENT_TARGETS.join(", ")}, or all | detect`,
			);
		}
		if (!targets.includes(part)) targets.push(part);
	}
	return { mode: "targets", targets };
}

export function planFromFlags(opts: {
	target?: string;
	all?: boolean;
	detect?: boolean;
}): InstallPlan {
	const flagCount = [opts.all, opts.detect, Boolean(opts.target)].filter(
		Boolean,
	).length;
	if (flagCount === 0) {
		throw new Error(
			`Specify --target <agent[,agent...]>, --all, or --detect. Agents: ${AGENT_TARGETS.join(", ")}`,
		);
	}
	if (flagCount > 1) {
		throw new Error(
			"Use only one of --target, --all, or --detect (not combined).",
		);
	}
	if (opts.all) return { mode: "all", targets: [...ALL_INSTALL_TARGETS] };
	if (opts.detect) {
		const d = targetsForDetect();
		return {
			mode: "detect",
			targets: d.targets,
			detected: d.detected,
			fallback: d.fallback,
		};
	}
	return parseTargetOption(opts.target as string);
}
