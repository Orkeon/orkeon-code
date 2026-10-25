// The checkout, the fakes and the scripted person runDevSpec is tested over.
import { readFileSync } from "node:fs";

import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import type { HumanInput } from "../../../shared/application/ports.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import type { SpecAnswer } from "../domain/spec-answer.ts";
import { runDevSpec } from "./run-dev-spec.ts";
import type { DevSpecInputs } from "./run-dev-spec.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

export const ANSWER = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/dev/spec/answer.json", import.meta.url), "utf8")) as SpecAnswer;
export const W = `${WORKSPACE}/workbench`;
export const CODE = `${W}/prune`;
export const SPEC = `${CODE}/SPEC-prune.md`;
export const CLEAR = { verdict: "CLEAR", rows: [] };
export const REQUEST = "Prune old memory entries before a cut-off.";

/** A person answering from a script: a string answers, null is nobody. Each question sees the spec as it is then. */
export function scripted(files: FakeFiles, script: Array<string | null>) {
  const asked: Array<{ kind: string; prompt: string; options: readonly string[]; specThen: string }> = [];
  const next = (kind: string, prompt: string, options: readonly string[]) => {
    asked.push({ kind, prompt, options, specThen: files.files.get(SPEC) ?? "" });
    return script.length === 0 ? null : script.shift() ?? null;
  };
  const human: HumanInput = {
    async choice(prompt, options) { const a = next("choice", prompt, options); return a === null ? { answered: false } : { answered: true, value: a }; },
    async text(prompt) { const a = next("text", prompt, []); return a === null ? { answered: false } : { answered: true, value: a }; },
    async multi(prompt, options) { const a = next("multi", prompt, options); return a === null ? { answered: false } : { answered: true, values: [a] }; },
  };
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
  first.llm.extractions = [ANSWER, folded(), CLEAR];
  await run(first);
  return first.files.files.get(SPEC) ?? "";
}
