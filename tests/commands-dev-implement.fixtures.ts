// Arguments, crew payloads and audit texts the /dev-implement tests hand over.
import type { DevImplementArgs } from "../src/commands/_lib/dev-implement.ts";

export interface ArgsCase {
  name: string;
  tokens: readonly string[];
  args: DevImplementArgs;
}

/** The arguments with defaults: no plan, no close, no pull request, no correction. */
export function implementArgs(over: Partial<DevImplementArgs> = {}): DevImplementArgs {
  return { batch: "F1", plan: null, close: false, pr: false, correction: null, ...over };
}

/** A batch and a plan, then a plan path with the close and the pull request. */
export const READ_CASES: readonly ArgsCase[] = [
  { name: "a batch and a plan code", tokens: ["F2", "prune"], args: implementArgs({ batch: "F2", plan: "prune" }) },
  {
    name: "a batch, a plan path, --close and --pr",
    tokens: ["F2", "workbench/prune/PRUNE-PLAN.md", "--close", "--pr"],
    args: implementArgs({ batch: "F2", plan: "workbench/prune/PRUNE-PLAN.md", close: true, pr: true }),
  },
];

/** Arguments refused once a batch is given. */
export const REFUSED_CASES: readonly { name: string; tokens: readonly string[] }[] = [
  { name: "a bad batch", tokens: ["2"] },
  { name: "two plans", tokens: ["F1", "a", "b"] },
  { name: "an unknown option", tokens: ["F1", "--fast"] },
  { name: "--pr without --close", tokens: ["F1", "--pr"] },
  { name: "a plan path out of the checkout", tokens: ["F1", "../x/X-PLAN.md"] },
];

/** A correction's finding after the dash, glued to the word, and the word alone read as a plan. */
export const CORRECTION_CASES: readonly ArgsCase[] = [
  {
    name: "the finding after the dash",
    tokens: ["F1", "—", "correction:", "Major", "Reuse:", "a", "copy"],
    args: implementArgs({ correction: "Major Reuse: a copy" }),
  },
  {
    name: "the finding glued to the word, the plan before it",
    tokens: ["F1", "demo", "correction:Blocking", "Test:", "x"],
    args: implementArgs({ plan: "demo", correction: "Blocking Test: x" }),
  },
  { name: "the word alone, read as the plan", tokens: ["F1", "correction"], args: implementArgs({ plan: "correction" }) },
];

/** The crew's payload naming the audit to launch next. */
export const AUDIT_PAYLOAD = JSON.stringify({ lines: ["a", "b"], next: { crew: "dev-verify", input: { batch: "F1", plan: "demo" } } });

/** The audit's text ending on its VALID line, after the verdict file it wrote. */
export const VALID_TEXT =
  "GATE — batch F1: GREEN\nwritten: workbench/demo/DEMO-VERIFY-F1.md — capture: workbench/demo/capture-F1/\n→ Batch F1 VALID. commit…";

/** A VALID line quoted inside a gap's row. */
export const QUOTED_VALID =
  "| Major | Test | the log says → Batch F1 VALID. | x | y |\n" +
  "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ /dev-implement F1 — correction: Major Test: z";

/** Audit texts whose VALID line launches no close. */
export const NO_CLOSE_CASES: readonly { name: string; text: string }[] = [
  {
    name: "a VALID line inside a correction",
    text: "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ /dev-implement F1 — correction: says → Batch F1 VALID.",
  },
  { name: "a VALID line naming another batch", text: "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ Batch F2 VALID. commit…" },
  { name: "a VALID line before the verdict file", text: "→ Batch F1 VALID. commit…\nwritten: workbench/demo/DEMO-VERIFY-F1.md — capture: x/" },
];

export const GAPS_TEXT = "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ /dev-implement F1 — correction: Major Reuse: y";

export const WRITES = "writes files, commits and pushes";

/** The modes refused, with the refusal each gets. */
export const REFUSED_MODES: readonly { name: string; mode: string; command: string; refusal: string }[] = [
  {
    name: "a read-only mode",
    mode: "plan",
    command: "dev-implement",
    refusal: "✗ refused: the session mode plan is read-only, and /dev-implement writes files, commits and pushes: /mode default, then run it again",
  },
  {
    name: "a mode that cannot be read",
    mode: "",
    command: "dev-batches",
    refusal: "✗ refused: the session mode could not be read, and /dev-batches writes files, commits and pushes: run it again",
  },
  {
    name: "an unknown mode",
    mode: "bogus",
    command: "dev-batches",
    refusal:
      "✗ refused: the session mode bogus is not one Orkeon Code knows, and /dev-batches writes files, commits and pushes: /mode default, then run it again",
  },
];

/** Writing modes, each with the command it lets run. */
export const WRITING_MODES: readonly { mode: string; command: string }[] = [
  { mode: "default", command: "dev-implement" },
  { mode: "acceptEdits", command: "dev-batches" },
];
