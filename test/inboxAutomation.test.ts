import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("inbox automation", () => {
	it("consumes inbox artifacts after evolve", () => {
		const root = process.cwd();
		const tmp = join(root, ".tmp-inbox-test");
		rmSync(tmp, { recursive: true, force: true });
		mkdirSync(tmp, { recursive: true });

		const cliPath = join(root, "dist", "cli.js");
		execSync(`node ${cliPath} init --project-name "Demo"`, {
			cwd: tmp,
			stdio: "pipe",
		});

		const inbox = join(tmp, ".inference-chain", "inbox");
		writeFileSync(
			join(inbox, "latest-update.yml"),
			`id: "u-test"\nproject_id: "Demo"\niteration: 0\ncreated_at: "2026-05-21T00:00:00.000Z"\ntrigger: "manual_checkpoint"\nwhat_changed: "x"\nnew_information: []\nconfirmed: []\nweakened: []\nrejected: []\nsuperseded: []\nnext_action_delta: ["n"]\ndo_not_repeat_delta: []\nhuman_note: ""\n`,
		);

		execSync(`node ${cliPath} evolve`, { cwd: tmp, stdio: "pipe" });

		expect(existsSync(join(inbox, "latest-update.yml"))).toBe(false);
		expect(
			existsSync(join(tmp, ".inference-chain", "updates", "u-test.yml")),
		).toBe(true);

		rmSync(tmp, { recursive: true, force: true });
	});
});
