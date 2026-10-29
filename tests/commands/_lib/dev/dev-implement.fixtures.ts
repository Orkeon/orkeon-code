// Arguments, crew payloads and audit texts the tests of one batch's chain hand over, and the checkout its dispatch runs
// over: the plan demo in the work folder workbench/, its sheet of batch F1 (tests/fixtures/dev/implement/) with two
// steps open, over FakeFiles, FakeShell, FakeSessionStore, FakePermissionRules and FakeToolCatalogue.
import { readFileSync } from "node:fs";

import { runDevImplementDispatch } from "../../../../src/commands/_lib/dev/dev-implement.ts";
import type { ChainLaunch, DevImplementArgs, DevImplementDispatch } from "../../../../src/commands/_lib/dev/dev-implement.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakePermissionRules } from "../../../support/doubles/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";

const SHEET = readFileSync(new URL("../../../fixtures/dev/implement/DEMO-PLAN-F1.md", import.meta.url), "utf-8");
const DEMO = `${WORKSPACE}/workbench/demo`;

export interface DispatchHarness {
  gate: FakePermissionRules;
  /** The lines the dispatch wrote, in order. */
  written: string[];
  /** Runs one batch's dispatch on its parsed arguments. */
  run(args: DevImplementArgs): Promise<DevImplementDispatch>;
}

/** The dispatch over the demo checkout, the session in `mode`. */
export function dispatchHarness(mode = "acceptEdits"): DispatchHarness {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["workbench"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(DEMO, ["DEMO-PLAN-F1.md", "DEMO-PLAN.md"]);
  files.files.set(`${DEMO}/DEMO-PLAN-F1.md`, SHEET);
  const store = new FakeSessionStore();
  const session = {
    readState: (key: string) => store.readState(key),
    writeState: (key: string, value: string) => store.writeState(key, value),
    resolveEffectiveSessionMode: async () => ({ mode, via: "test" }),
  };
  const config = createConfigStore({ files, session: store });
  const gate = new FakePermissionRules();
  const catalogue = new FakeToolCatalogue();
  const written: string[] = [];
  return {
    gate,
    written,
    run: (args) => runDevImplementDispatch(args, {
      session, config, files, shell: new FakeShell(), gate: () => gate, catalogue: () => catalogue, write: (line) => written.push(line),
    }),
  };
}

/** The arguments with defaults: no plan, no close, no pull request, no correction. */
export function implementArgs(over: Partial<DevImplementArgs> = {}): DevImplementArgs {
  return { batch: "F1", plan: null, close: false, pr: false, correction: null, ...over };
}

/** The step count the dispatch hands the crew, per argument line: the sheet's two open steps, one more for a correction. */
export const STEPS_CASES: readonly { name: string; args: DevImplementArgs; steps: number | undefined }[] = [
  { name: "sizes the run to the sheet's open steps", args: implementArgs({ plan: "demo" }), steps: 2 },
  { name: "adds one open step for a correction", args: implementArgs({ plan: "demo", correction: "Major Test: x" }), steps: 3 },
  { name: "counts no step for the close alone", args: implementArgs({ plan: "demo", close: true }), steps: undefined },
];

/** The audit the batch is chained to, as the crew's payload names it. */
export const AUDIT_LAUNCH: ChainLaunch = { crew: "dev-verify", input: { batch: "F1", plan: "demo" }, instead: "/dev-batches demo F1 --audit" };

/** The close VALID_TEXT launches. */
export const CLOSE_LAUNCH: ChainLaunch = {
  crew: "dev-implement", input: { batch: "F1", plan: "workbench/demo/DEMO-PLAN.md", close: true },
  instead: "/dev-batches workbench/demo/DEMO-PLAN.md F1 --close",
};

/** The crew's payload naming the audit to launch next. */
export const AUDIT_PAYLOAD = JSON.stringify({ lines: ["a", "b"], next: { crew: "dev-verify", input: { batch: "F1", plan: "demo" } } });

/** The audit's text ending on its VALID line, after the verdict file it wrote. */
export const VALID_TEXT =
  "GATE — batch F1: GREEN\nwritten: workbench/demo/DEMO-VERIFY-F1.md — capture: workbench/demo/capture-F1/\n→ Batch F1 VALID. commit…";

/** A VALID line quoted inside a gap's row. */
export const QUOTED_VALID =
  "| Major | Test | the log says → Batch F1 VALID. | x | y |\n" +
  "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ /dev-batches demo F1 — correction: Major Test: z";

/** Audit texts whose VALID line launches no close. */
export const NO_CLOSE_CASES: readonly { name: string; text: string }[] = [
  {
    name: "a VALID line inside a correction",
    text: "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ /dev-batches demo F1 — correction: says → Batch F1 VALID.",
  },
  { name: "a VALID line naming another batch", text: "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ Batch F2 VALID. commit…" },
  { name: "a VALID line before the verdict file", text: "→ Batch F1 VALID. commit…\nwritten: workbench/demo/DEMO-VERIFY-F1.md — capture: x/" },
];

export const GAPS_TEXT = "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ /dev-batches demo F1 — correction: Major Reuse: y";

export const WRITES = "writes files, commits and pushes";

/** The modes refused, with the refusal each gets. */
export const REFUSED_MODES: readonly { name: string; mode: string; command: string; refusal: string }[] = [
  {
    name: "a read-only mode",
    mode: "plan",
    command: "dev-batches",
    refusal: "✗ refused: the session mode plan is read-only, and /dev-batches writes files, commits and pushes: /mode default, then run it again",
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
  { mode: "default", command: "dev-batches" },
  { mode: "acceptEdits", command: "dev-batches" },
];
