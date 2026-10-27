// The arguments /dev-batches is tested on, and the crew answers its chain step reads.
import type { parseDevBatchesArgs } from "../../../../src/commands/_lib/dev/dev-batches.ts";

type Parsed = ReturnType<typeof parseDevBatchesArgs>;

export const ACCEPTED_ARGS_CASES: readonly { name: string; tokens: string[]; expected: Parsed }[] = [
  { name: "reads nothing as no code and no pull request", tokens: [], expected: { ok: true, args: { code: null, pr: false } } },
  { name: "reads a code and --pr", tokens: ["demo", "--pr"], expected: { ok: true, args: { code: "demo", pr: true } } },
  {
    name: "keeps a typed --concurrency 1, which goes back to one at a time",
    tokens: ["demo", "--concurrency", "1"],
    expected: { ok: true, args: { code: "demo", pr: false, concurrency: 1 } },
  },
  {
    name: "keeps a typed --concurrency=1, which goes back to one at a time",
    tokens: ["--concurrency=1", "demo"],
    expected: { ok: true, args: { code: "demo", pr: false, concurrency: 1 } },
  },
  { name: "adds no concurrency key when none is typed", tokens: ["demo"], expected: { ok: true, args: { code: "demo", pr: false } } },
  {
    name: "accepts 2 batches at once",
    tokens: ["demo", "--concurrency", "2"],
    expected: { ok: true, args: { code: "demo", pr: false, concurrency: 2 } },
  },
  { name: "accepts 4 batches at once", tokens: ["--concurrency=4"], expected: { ok: true, args: { code: null, pr: false, concurrency: 4 } } },
  {
    name: "refuses above 4 batches at once in one line",
    tokens: ["demo", "--concurrency", "5"],
    expected: { ok: false, text: "dev-batches: concurrency 5 refused: at most 4 batches at once" },
  },
];

export const REFUSED_ARGS_CASES: readonly { name: string; tokens: string[] }[] = [
  { name: "refuses two codes", tokens: ["a", "b"] },
  { name: "refuses a path", tokens: ["../x"] },
  { name: "refuses an unknown option", tokens: ["--fast"] },
  { name: "refuses --concurrency without a value", tokens: ["--concurrency"] },
  { name: "refuses a concurrency of 0", tokens: ["--concurrency", "0"] },
  { name: "refuses a concurrency that is not a number", tokens: ["--concurrency=x"] },
];

/** What the launch reads from the session. */
export const READ = { ruleSets: ["git-readonly"], effort: "high", permissionMode: "bypassPermissions", permissionRules: [], githubTool: true };

/** Today's launch input for `demo`, without the option. */
export const TODAY = { code: "demo", pr: false, ...READ };

export const LAUNCH_CASES: readonly { name: string; tokens: string[]; expected: object }[] = [
  { name: "is today's input without the option: no concurrency key", tokens: ["demo"], expected: TODAY },
  {
    name: "carries a typed 1, to override the run in progress",
    tokens: ["demo", "--concurrency", "1"],
    expected: { ...TODAY, concurrency: 1 },
  },
  { name: "carries the concurrency above 1", tokens: ["demo", "--concurrency", "3"], expected: { ...TODAY, concurrency: 3 } },
];

export const ASKING_MODE_REFUSAL =
  "dev-batches: concurrency 2 refused: the session mode acceptEdits asks before shell commands, and two batches would ask at once: /mode bypassPermissions, or run with --concurrency 1";

export const MODE_CASES: readonly {
  name: string;
  args: { code: string; pr: boolean; concurrency?: number };
  mode: string;
  expected: string | null;
}[] = [
  {
    name: "refuses above 1 in a mode that asks before shell commands, before any launch",
    args: { code: "demo", pr: false, concurrency: 2 },
    mode: "acceptEdits",
    expected: ASKING_MODE_REFUSAL,
  },
  { name: "lets above 1 run in a mode that never asks", args: { code: "demo", pr: false, concurrency: 2 }, mode: "bypassPermissions", expected: null },
  { name: "lets one at a time run in any mode", args: { code: "demo", pr: false }, mode: "default", expected: null },
];

/** The dev-batches crew's input for batch F2. */
export const F2_INPUT = { batch: "F2", plan: "demo", effort: "high" };

/** A dev-verify answer that closes batch F2 VALID. */
export const VALID_VERIFY = "written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/\n→ Batch F2 VALID. commit…";

/** A dev-verify answer that launches nothing: a correction, after a blank line. */
export const CORRECTION_VERIFY = "written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/\n\n→ /dev-implement F2 — correction: Major y";

/** A dev-implement answer of 30 lines. */
export const THIRTY_LINES = JSON.stringify({ lines: Array.from({ length: 30 }, (_, i) => `l${i}`) });

/** The next wave the dev-batches crew names. */
export const NEXT_WAVE_INPUT = { after: ["✓ F2 merged"], concurrency: 2 };

/** The launch the dev-batches crew names for the next batch, the github tool withheld as the crew does. */
export const BATCH_LAUNCH = {
  crew: "dev-implement", input: { ...F2_INPUT, permissionMode: "bypassPermissions", permissionRules: [], githubTool: false },
  instead: "/dev-implement F2 demo",
};

/** The crew's answer naming the next batch. */
export const NEXT_BATCH_RESULT = {
  success: true, intent: "dev-batches", payload: JSON.stringify({ lines: ["→ F2 launched"], next: { crew: "dev-implement", input: BATCH_LAUNCH.input } }),
};

/** The audit's VALID answer, which closes the batch. */
export const CLOSE_RESULT = { success: true, intent: "dev-verify", payload: VALID_VERIFY };

/** The crew's answer naming the next wave of a parallel run. */
export const NEXT_WAVE_RESULT = {
  success: true, intent: "dev-batches", payload: JSON.stringify({ lines: ["✓ F2 merged"], next: { crew: "dev-batches", input: NEXT_WAVE_INPUT } }),
};

/** A rule the session gained between two batches. */
export const FRESH_RULES = ["deny shell_command command=git push*"];
