// The arguments /dev-batches is tested on in its three shapes (the run, one batch, one audit) and under its aliases,
// the crew answers its chain step reads, and the checkout an audit's dispatch runs over (FakeSessionStore,
// FakePermissionRules, FakeToolCatalogue, a config store on FakeFiles).
import { DEV_BATCHES_USAGE, runDevVerifyDispatch } from "../../../../src/commands/_lib/dev/dev-batches.ts";
import type { DevVerifyArgs, DevVerifyDispatch, parseDevBatchesArgs } from "../../../../src/commands/_lib/dev/dev-batches.ts";
import type { DevImplementArgs } from "../../../../src/commands/_lib/dev/dev-implement.ts";
import { createConfigStore, USER_CONFIG_FILE_PATH } from "../../../../src/shared/application/config-store.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakePermissionRules } from "../../../support/doubles/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";

export const ACCEPTED_ARGS_CASES: readonly { name: string; tokens: string[]; expected: Parsed }[] = [
  { name: "reads nothing as no code and no pull request", tokens: [], expected: { ok: true, route: "run", args: { code: null, pr: false } } },
  { name: "reads a code and --pr", tokens: ["demo", "--pr"], expected: { ok: true, route: "run", args: { code: "demo", pr: true } } },
  {
    name: "keeps a typed --concurrency 1, which goes back to one at a time",
    tokens: ["demo", "--concurrency", "1"],
    expected: { ok: true, route: "run", args: { code: "demo", pr: false, concurrency: 1 } },
  },
  {
    name: "keeps a typed --concurrency=1, which goes back to one at a time",
    tokens: ["--concurrency=1", "demo"],
    expected: { ok: true, route: "run", args: { code: "demo", pr: false, concurrency: 1 } },
  },
  { name: "adds no concurrency key when none is typed", tokens: ["demo"], expected: { ok: true, route: "run", args: { code: "demo", pr: false } } },
  {
    name: "accepts 2 batches at once",
    tokens: ["demo", "--concurrency", "2"],
    expected: { ok: true, route: "run", args: { code: "demo", pr: false, concurrency: 2 } },
  },
  { name: "accepts 4 batches at once", tokens: ["--concurrency=4"], expected: { ok: true, route: "run", args: { code: null, pr: false, concurrency: 4 } } },
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
  { name: "refuses --close without a batch", tokens: ["demo", "--close"] },
  { name: "refuses a correction without a batch", tokens: ["demo", "—", "correction:", "x"] },
];

/** One batch's arguments with defaults: no plan, no close, no pull request, no correction. */
export function batchArgs(over: Partial<DevImplementArgs> = {}): DevImplementArgs {
  return { batch: "F1", plan: null, close: false, pr: false, correction: null, ...over };
}

/** Lines with a batch and no --audit: one batch, its plan and close, or its correction. */
export const BATCH_READ_CASES: readonly { name: string; tokens: string[]; args: DevImplementArgs }[] = [
  { name: "reads a code then a batch", tokens: ["prune", "F2"], args: batchArgs({ batch: "F2", plan: "prune" }) },
  { name: "reads a batch before its code", tokens: ["F2", "prune"], args: batchArgs({ batch: "F2", plan: "prune" }) },
  {
    name: "reads a plan path, --close and --pr",
    tokens: ["workbench/prune/PRUNE-PLAN.md", "F2", "--close", "--pr"],
    args: batchArgs({ batch: "F2", plan: "workbench/prune/PRUNE-PLAN.md", close: true, pr: true }),
  },
  {
    name: "reads a correction's finding after the dash",
    tokens: ["demo", "F1", "—", "correction:", "Major", "Reuse:", "a", "copy"],
    args: batchArgs({ plan: "demo", correction: "Major Reuse: a copy" }),
  },
  {
    name: "reads a correction's finding glued to the word",
    tokens: ["demo", "F1", "correction:Blocking", "Test:", "x"],
    args: batchArgs({ plan: "demo", correction: "Blocking Test: x" }),
  },
  { name: "reads the word correction alone as the plan", tokens: ["correction", "F1"], args: batchArgs({ plan: "correction" }) },
];

/** Lines with a batch and no --audit refused, each with its own text. */
export const BATCH_REFUSED_CASES: readonly { name: string; tokens: string[]; text: string }[] = [
  { name: "refuses --pr without --close", tokens: ["demo", "F1", "--pr"], text: "dev-batches: with F1, --pr goes with --close (the pull request is opened at the close)" },
  {
    name: "refuses a correction with --close",
    tokens: ["demo", "F1", "--close", "—", "correction:", "x"],
    text: "dev-batches: a correction runs the batch, --close commits it: one at a time",
  },
  {
    name: "refuses --concurrency with a batch",
    tokens: ["demo", "F1", "--concurrency", "2"],
    text: "dev-batches: --concurrency runs a plan's batches: it does not go with F1",
  },
  { name: "refuses two batches", tokens: ["demo", "F1", "F2"], text: "dev-batches: one batch at most, not F1 and F2" },
  { name: "refuses two plans", tokens: ["a", "F1", "b"], text: "dev-batches: one plan at most, not 'a' and 'b'" },
  { name: "refuses an unknown option", tokens: ["demo", "F1", "--fast"], text: "dev-batches: unknown option '--fast' with F1 (--close, --pr, --audit)" },
  {
    name: "refuses a plan path out of the checkout",
    tokens: ["F1", "../x/X-PLAN.md"],
    text: "dev-batches: '../x/X-PLAN.md' is neither a code nor a <CODE>-PLAN.md path",
  },
  {
    name: "refuses a correction without its finding",
    tokens: ["F1", "—", "correction:"],
    text: "dev-batches: a correction names its finding: /dev-batches <code> F1 — correction: <the audit's gap>",
  },
  { name: "refuses an audit mode without --audit", tokens: ["demo", "F1", "full"], text: "dev-batches: 'full' goes with --audit: /dev-batches <code> F1 --audit full" },
];

/** Lines with a batch and --audit: one audit, its plan, its mode (fast by default) and the gate alone. */
export const AUDIT_READ_CASES: readonly { name: string; tokens: string[]; args: DevVerifyArgs }[] = [
  {
    name: "reads the audit's tokens in any order",
    tokens: ["F2", "resume", "--audit", "demo", "--gate-only"],
    args: { batch: "F2", plan: "demo", mode: "resume", gateOnly: true },
  },
  { name: "reads fast by default", tokens: ["F2", "--audit", "--gate-only"], args: { batch: "F2", plan: null, mode: "fast", gateOnly: true } },
  {
    name: "reads a plan path and a mode",
    tokens: ["workbench/demo/DEMO-PLAN.md", "F12", "--audit", "full"],
    args: { batch: "F12", plan: "workbench/demo/DEMO-PLAN.md", mode: "full", gateOnly: false },
  },
  {
    name: "reads a plan path under the workspace",
    tokens: [`${WORKSPACE}/workbench/demo/DEMO-PLAN.md`, "F2", "--audit"],
    args: { batch: "F2", plan: `${WORKSPACE}/workbench/demo/DEMO-PLAN.md`, mode: "fast", gateOnly: false },
  },
  { name: "reads fast, full and resume as modes, never as codes", tokens: ["F2", "--audit", "full"], args: { batch: "F2", plan: null, mode: "full", gateOnly: false } },
];

/** Lines with --audit refused, each with its own text. */
export const AUDIT_REFUSED_CASES: readonly { name: string; tokens: string[]; text: string }[] = [
  {
    name: "refuses two audit modes",
    tokens: ["F2", "--audit", "fast", "resume"],
    text: "dev-batches: one audit mode at most (fast, full or resume), not 'fast' and 'resume'",
  },
  { name: "refuses an unknown option with --audit", tokens: ["F2", "--audit", "--raw"], text: "dev-batches: unknown option '--raw' with --audit (only --gate-only)" },
  { name: "refuses --close with --audit", tokens: ["F2", "--audit", "--close"], text: "dev-batches: unknown option '--close' with --audit (only --gate-only)" },
  { name: "refuses two plans with --audit", tokens: ["demo", "F2", "--audit", "other"], text: "dev-batches: one plan at most, not 'demo' and 'other'" },
  { name: "refuses a path that is not a plan", tokens: ["F2", "--audit", "a/b"], text: "dev-batches: 'a/b' is neither a code nor a <CODE>-PLAN.md path" },
  {
    name: "refuses a plan path climbing out",
    tokens: ["F2", "--audit", "../x/DEMO-PLAN.md"],
    text: "dev-batches: '../x/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path",
  },
  {
    name: "refuses an absolute plan path",
    tokens: ["F2", "--audit", "/etc/DEMO-PLAN.md"],
    text: "dev-batches: '/etc/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path",
  },
  {
    name: "refuses a correction with --audit",
    tokens: ["demo", "F2", "--audit", "—", "correction:", "x"],
    text: "dev-batches: --audit judges the batch, a correction runs it: one at a time",
  },
  { name: "refuses --audit without a batch", tokens: ["demo", "--audit"], text: "dev-batches: --audit names its batch: /dev-batches <code> F<n> --audit" },
  { name: "refuses --gate-only without a batch", tokens: ["--gate-only"], text: "dev-batches: --gate-only names its batch: /dev-batches <code> F<n> --gate-only" },
];

type Parsed = ReturnType<typeof parseDevBatchesArgs>;

/** The lines typed under the aliases /dev-implement and /dev-verify, read in the shape they had. */
export const ALIAS_CASES: readonly { name: string; typed: string; tokens: string[]; expected: Parsed }[] = [
  {
    name: "reads /dev-implement F2 prune as one batch",
    typed: "dev-implement",
    tokens: ["F2", "prune"],
    expected: { ok: true, route: "batch", args: batchArgs({ batch: "F2", plan: "prune" }) },
  },
  {
    name: "reads /dev-implement with a correction as one batch",
    typed: "dev-implement",
    tokens: ["F1", "demo", "—", "correction:", "x"],
    expected: { ok: true, route: "batch", args: batchArgs({ plan: "demo", correction: "x" }) },
  },
  {
    name: "reads /dev-verify F2 demo resume as its audit, without --audit",
    typed: "dev-verify",
    tokens: ["F2", "demo", "resume"],
    expected: { ok: true, route: "audit", args: { batch: "F2", plan: "demo", mode: "resume", gateOnly: false } },
  },
  {
    name: "reads /dev-verify F2 --gate-only as the gate alone",
    typed: "dev-verify",
    tokens: ["F2", "--gate-only"],
    expected: { ok: true, route: "audit", args: { batch: "F2", plan: null, mode: "fast", gateOnly: true } },
  },
  { name: "answers /dev-implement alone with the usage", typed: "dev-implement", tokens: [], expected: { ok: false, text: DEV_BATCHES_USAGE } },
  {
    name: "refuses /dev-verify without a batch, never as a run",
    typed: "dev-verify",
    tokens: ["demo"],
    expected: { ok: false, text: "dev-batches: /dev-verify names its batch first: F<n>, e.g. F2" },
  },
  {
    name: "refuses /dev-implement without a batch, never as a run",
    typed: "dev-implement",
    tokens: ["demo", "--pr"],
    expected: { ok: false, text: "dev-batches: /dev-implement names its batch first: F<n>, e.g. F2" },
  },
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
export const CORRECTION_VERIFY = "written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/\n\n→ /dev-batches demo F2 — correction: Major y";

/** A dev-implement answer of 30 lines. */
export const THIRTY_LINES = JSON.stringify({ lines: Array.from({ length: 30 }, (_, i) => `l${i}`) });

/** The next wave the dev-batches crew names. */
export const NEXT_WAVE_INPUT = { after: ["✓ F2 merged"], concurrency: 2 };

/** The launch the dev-batches crew names for the next batch, the github tool withheld as the crew does. */
export const BATCH_LAUNCH = {
  crew: "dev-implement", input: { ...F2_INPUT, permissionMode: "bypassPermissions", permissionRules: [], githubTool: false },
  instead: "/dev-batches demo F2",
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

/** The audit's VALID answer the console already showed as it came (Orkeon #228). */
export const STREAMED_AUDIT = { success: true, intent: "dev-verify", payload: VALID_VERIFY, streamed: true };

/** What readChain answers, per crew that answered and per chain the session holds. */
export const READ_CHAIN_CASES: readonly { name: string; intent: string; stored: string | null; expected: string }[] = [
  { name: "reads an answer of the dev-batches crew as a run, whatever is recorded", intent: "dev-batches", stored: "audit", expected: "run" },
  { name: "reads an audit's answer as the audit recorded", intent: "dev-verify", stored: "audit", expected: "audit" },
  { name: "reads a batch's answer as the batch recorded", intent: "dev-implement", stored: "batch", expected: "batch" },
  { name: "reads an answer as a run when no chain is recorded", intent: "dev-verify", stored: null, expected: "run" },
  { name: "reads an answer as a run when the recorded chain is unknown", intent: "dev-verify", stored: "bogus", expected: "run" },
];

/** What recordChain answers when the session cannot keep the chain, per chain. */
export const RECORD_FAILURE_CASES: readonly { chain: "run" | "batch" | "audit"; expected: string | null }[] = [
  { chain: "run", expected: null },
  { chain: "batch", expected: "dev-batches: the session could not keep which chain runs (no state): nothing was launched" },
  { chain: "audit", expected: "dev-batches: the session could not keep which chain runs (no state): nothing was launched" },
];

export interface VerifyHarness {
  gate: FakePermissionRules;
  store: FakeSessionStore;
  /** The lines the dispatch wrote, in order. */
  written: string[];
  /** Runs one audit's dispatch on its parsed arguments. */
  run(args: DevVerifyArgs): Promise<DevVerifyDispatch>;
}

/** An audit's dispatch over an empty checkout, the session in acceptEdits. */
export function verifyHarness(): VerifyHarness {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const session = {
    readState: (key: string) => store.readState(key),
    writeState: (key: string, value: string) => store.writeState(key, value),
    resolveEffectiveSessionMode: async () => ({ mode: "acceptEdits", via: "test" }),
  };
  const config = createConfigStore({ files, session: store });
  const gate = new FakePermissionRules();
  const catalogue = new FakeToolCatalogue();
  const written: string[] = [];
  return {
    gate,
    store,
    written,
    run: (args) => runDevVerifyDispatch(args, { session, config, gate: () => gate, catalogue: () => catalogue, write: (line) => written.push(line) }),
  };
}

/** The config store launchCompletedHop reads `llm.profile` from: the user settings naming `profile`, or none. */
export function hopConfig(profile?: string) {
  const files = new FakeFiles();
  if (profile !== undefined) files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "llm.profile": profile }));
  return createConfigStore({ files, session: new FakeSessionStore() });
}
