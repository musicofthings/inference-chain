import { ZodError } from "zod";

/**
 * One actionable line naming the first concrete problem.
 *
 * A raw ZodError stringifies to a multi-page JSON dump of every unmet field,
 * which is unreadable in a terminal and actively hostile inside a lifecycle
 * hook, where it floods the session transcript.
 */
export function firstProblem(err: unknown): string {
	if (err instanceof ZodError) {
		const issue = err.issues[0];
		if (!issue) return "failed schema validation";
		const where = issue.path.join(".") || "(root)";
		const more =
			err.issues.length > 1 ? ` (+${err.issues.length - 1} more)` : "";
		return `${where}: ${issue.message}${more}`;
	}
	return err instanceof Error ? err.message.split("\n")[0] : String(err);
}
