import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	HOST_CAPABILITIES,
	formatCapabilities,
} from "./integrations/capabilities.js";
import { detectHosts } from "./integrations/detect.js";
import { inspectWiring } from "./integrations/evidence.js";
import { resolveIcLaunch } from "./integrations/shared/mcp.js";
import type { AgentTarget } from "./integrations/types.js";
import { PATHS } from "./storage/paths.js";
import { verifyLedger } from "./storage/persist.js";
import { openDb } from "./storage/sqlite.js";

export type DoctorSeverity = "ok" | "warn" | "fail";

export type DoctorCheck = {
	id: string;
	status: DoctorSeverity;
	message: string;
	hint?: string;
};

export type DoctorReport = {
	cwd: string;
	ok: boolean;
	/** True when no fail checks (warns allowed). */
	healthy: boolean;
	checks: DoctorCheck[];
	detected: AgentTarget[];
	wired: AgentTarget[];
	unwired: AgentTarget[];
};

export type DoctorOpts = {
	cwd?: string;
	/** When true, treat warn as unhealthy (exit non-zero). */
	strict?: boolean;
};

export function runDoctor(opts: DoctorOpts = {}): DoctorReport {
	const cwd = resolve(opts.cwd ?? process.cwd());
	const prevCwd = process.cwd();
	if (cwd !== prevCwd) process.chdir(cwd);
	try {
		return runDoctorInCwd(cwd, opts.strict);
	} finally {
		if (cwd !== prevCwd) process.chdir(prevCwd);
	}
}

function runDoctorInCwd(cwd: string, strict?: boolean): DoctorReport {
	const checks: DoctorCheck[] = [];

	const initialized = existsSync(PATHS.currentYml());
	if (initialized) {
		checks.push({
			id: "project",
			status: "ok",
			message: "Project initialized (.inference-chain/current.yml)",
		});
	} else {
		checks.push({
			id: "project",
			status: "fail",
			message: "No .inference-chain/current.yml — ledger not initialized",
			hint: 'Run: ic init --project-name "<name>"',
		});
	}

	const launch = resolveIcLaunch();
	const launchCmd = [launch.command, ...launch.prefixArgs].join(" ");
	checks.push({
		id: "launch",
		status: "ok",
		message: `MCP launch resolves to: ${launchCmd} mcp --cwd <project>`,
		hint:
			launch.command === "ic"
				? "Ensure `ic` is on PATH, or run install via the packaged CLI so configs pin node + dist/cli.js."
				: undefined,
	});

	if (initialized && existsSync(PATHS.ledgerJsonl())) {
		const db = openDb(PATHS.db());
		try {
			const v = verifyLedger(db);
			const overall = v.ok && v.inSync && v.currentYmlOk;
			checks.push({
				id: "verify",
				status: overall ? "ok" : "fail",
				message: overall
					? `Hash chain ok (${v.total} events, sqlite in sync)`
					: `Ledger verification failed (ok=${v.ok}, in_sync=${v.inSync}, current_yml_ok=${v.currentYmlOk})`,
				hint: overall
					? undefined
					: `Errors: ${[...v.errors, ...v.currentYmlErrors].slice(0, 3).join("; ") || "see ic verify"}`,
			});
		} finally {
			db.close();
		}
	} else if (initialized) {
		checks.push({
			id: "verify",
			status: "warn",
			message: "Project exists but ledger.jsonl is missing",
			hint: "Re-run ic init --force only if you intend to wipe state.",
		});
	}

	const detected = detectHosts(cwd);
	const detectedTargets = detected.map((d) => d.target);
	const wired: AgentTarget[] = [];
	const unwired: AgentTarget[] = [];

	if (detected.length === 0) {
		checks.push({
			id: "hosts",
			status: "warn",
			message: "No coding-agent host markers detected in this repo",
			hint: "Run: ic install --detect  (or --target <agent> / --all)",
		});
	} else {
		checks.push({
			id: "hosts",
			status: "ok",
			message: `Detected hosts: ${detected
				.map((d) => `${d.target}[${d.matched.join("|")}]`)
				.join(", ")}`,
		});

		for (const d of detected) {
			const wiring = inspectWiring(d.target, cwd);
			const caps = formatCapabilities(HOST_CAPABILITIES[d.target]);
			if (wiring.wired) {
				wired.push(d.target);
				const mcpNote =
					wiring.mcpConfigured === true
						? "mcp=yes"
						: wiring.mcpConfigured === false
							? "mcp=no"
							: "mcp=n/a";
				checks.push({
					id: `wiring:${d.target}`,
					status: wiring.mcpConfigured === false ? "warn" : "ok",
					message: `${d.target} (${caps}): wired via ${wiring.present.join(", ")} (${mcpNote})`,
					hint:
						wiring.mcpConfigured === false
							? `Re-run: ic install --target ${d.target}`
							: undefined,
				});
			} else {
				unwired.push(d.target);
				checks.push({
					id: `wiring:${d.target}`,
					status: "warn",
					message: `${d.target} (${caps}): host present but Inference Chain wiring not found`,
					hint: `Run: ic install --target ${d.target}`,
				});
			}
		}
	}

	// Evidence of IC install without a matching host folder (orphan desktop snippet etc.)
	for (const orphan of ["desktop", "generic"] as AgentTarget[]) {
		if (detectedTargets.includes(orphan)) continue;
		const wiring = inspectWiring(orphan, cwd);
		if (wiring.wired) {
			checks.push({
				id: `extra:${orphan}`,
				status: "ok",
				message: `${orphan} artifacts present (${wiring.present.join(", ")})`,
			});
		}
	}

	const hasFail = checks.some((c) => c.status === "fail");
	const hasWarn = checks.some((c) => c.status === "warn");
	const healthy = strict ? !hasFail && !hasWarn : !hasFail;

	return {
		cwd,
		ok: healthy,
		healthy,
		checks,
		detected: detectedTargets,
		wired,
		unwired,
	};
}

export function formatDoctorReport(report: DoctorReport): string {
	const lines: string[] = [];
	lines.push(`ic doctor — ${report.cwd}`);
	lines.push(
		`summary: ${report.healthy ? "healthy" : "issues found"}${
			report.detected.length ? ` · detected=${report.detected.join(",")}` : ""
		}${report.unwired.length ? ` · unwired=${report.unwired.join(",")}` : ""}`,
	);
	for (const c of report.checks) {
		const tag = c.status.toUpperCase().padEnd(4);
		lines.push(`[${tag}] ${c.message}`);
		if (c.hint) lines.push(`       hint: ${c.hint}`);
	}
	return lines.join("\n");
}
