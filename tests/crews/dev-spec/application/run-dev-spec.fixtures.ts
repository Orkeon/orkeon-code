// The checkout, the fakes and the scripted person runDevSpec is tested over.
import { readFileSync } from "node:fs";

import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeCodeIndex } from "../../../support/doubles/fake-code-index.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeHumanInput } from "../../../support/doubles/fake-human-input.ts";
import type { HumanQuestion } from "../../../support/doubles/fake-human-input.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { GIT_TOPLEVEL } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../../src/shared/application/dev/load-dev-context.ts";
import type { SpecAnswer } from "../../../../src/crews/dev-spec/domain/spec-answer.ts";
import { runDevSpec } from "../../../../src/crews/dev-spec/application/run-dev-spec.ts";
import type { DevSpecInputs } from "../../../../src/crews/dev-spec/application/run-dev-spec.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const ANSWER = JSON.parse(readFileSync(new URL("../../../fixtures/dev/spec/answer.json", import.meta.url), "utf8")) as SpecAnswer;
export const W = `${WORKSPACE}/workbench`;
export const CODE = `${W}/prune`;
export const SPEC = `${CODE}/SPEC-prune.md`;
export const CLEAR = { verdict: "CLEAR", rows: [] };
export const REQUEST = "Prune old memory entries before a cut-off.";

/** A person answering from a script: a string answers, null is nobody. Each question sees the spec as it is then. */
export function scripted(files: FakeFiles, script: Array<string | null>) {
  const asked: Array<HumanQuestion & { specThen: string }> = [];
  const human = new FakeHumanInput();
  human.answers = script;
  human.onAsk = (q) => { asked.push({ ...q, specThen: files.files.get(SPEC) ?? "" }); };
  return { human, asked };
}

/** A checkout, a model answering ANSWER then a CLEAR review, a built index, and a person answering `script`. */
export function devSpecSetup(script: Array<string | null> = []) {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["workbench/", "src/"]);
  files.listings.set(W, ["prune/"]);
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE])] = { stdout: ".orkeon/config.json\n" };
  const llm = new FakeLlm();
  llm.extractions = [ANSWER, CLEAR];
  llm.answers = ["CLEAR: nothing to ask."];
  const index = new FakeCodeIndex();
  index.roots = 1;
  const log = new FakeLogger();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const person = scripted(files, script);
  const deps = { files, shell, llm, config, index, human: person.human, log, clock: () => new Date(2026, 9, 24, 9, 0) };
  return { files, shell, llm, log, person, deps };
}
export type Setup = ReturnType<typeof devSpecSetup>;

/** `devSpecSetup(script)` on a clock moving 30 s at each read: each timed phase takes a known time. */
export function timedSetup(script: Array<string | null>): Setup {
  const f = devSpecSetup(script);
  const clock = new FakeClock();
  clock.tickMs = 30_000;
  return { ...f, deps: { ...f.deps, clock: clock.now } };
}

/** The timing line of a timed new spec, one question decided, reviewed CLEAR, folded once at the end: the person's round apart
 *  from the model's fold, the review's extraction apart from its act. */
export const SPEC_TIMING = "timing: inventory 30 s · draft 30 s · questions 30 s · review 1 min 0 s · " +
  "review extract 30 s · fold 30 s · other 3 min 30 s — total 7 min 0 s";

/** Runs runDevSpec on `input` over the setup's deps. */
export const run = (f: Setup, input: DevSpecInputs = { code: "prune", request: REQUEST }) => runDevSpec(input, f.deps);

/** The answer after a fold: the decided question gone from the model's questions. */
export const folded = (): SpecAnswer => ({ ...ANSWER, questions: ANSWER.questions.slice(1) });

/** A review with one Blocking row on UC-01. */
export const GAPS_REVIEW = {
  verdict: "GAPS", rows: [{ severity: "Blocking", question: "Is the user told which entries were pruned?", evidence: "§ 4", target: "UC-01" }],
};

/** The spec a first run leaves when the person answered Q1 "No" and left Q2 open. */
export async function specWithQ1Decided(): Promise<string> {
  const first = devSpecSetup(["No", "Leave it open"]);
  first.llm.extractions = [ANSWER, CLEAR, folded()];
  await run(first);
  return first.files.files.get(SPEC) ?? "";
}
