// The checkout, the fakes and the scripted HumanInput runDevChange is tested over.
import { readFileSync } from "node:fs";

import { FakeCodeIndex } from "../../../../tests/support/doubles/fake-code-index.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import type { HumanInput } from "../../../shared/application/ports.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import type { ChangeAnswer } from "../domain/change-answer.ts";
import { runDevChange } from "./run-dev-change.ts";
import type { DevChangeInputs } from "./run-dev-change.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

export const PACK = readFileSync(new URL("../../../../tests/fixtures/dev/plan/pack.yaml", import.meta.url), "utf8");
export const W = `${WORKSPACE}/workbench`;
export const CODE = `${W}/cache`;
export const BRIEF = `${CODE}/CHANGE-cache.md`;
export const REPRO = `${CODE}/repro-cache.txt`;
export const CMD = "node --test tests/symbol-map.test.ts";
export const CLEAR = { verdict: "CLEAR", rows: [] };

/** The model's change brief: one criterion, one protected behaviour, one Blocking question; `over` replacing some. */
export const answer = (over: Partial<ChangeAnswer> = {}): ChangeAnswer => ({
  route: "change", name: "The symbol map is read on every call",
  summary: "A second request for the symbol map reads the file again.",
  evidence: ["src/map.ts:12 reads the file on each call"], suspected: "",
  criteria: [{ name: "The map is read once", statement: "a second request reads no file", proof: "the reproduction turns green", severity: "blocking" }],
  mustNotChange: [{ behaviour: "an absent map gives an empty map", pinnedBy: "loads an absent map" }],
  scope: [], constraints: [], assumptions: [],
  questions: [{ severity: "Blocking", question: "Does a changed file reload the map?", impact: "CH-01", options: ["Yes", "No"] }],
  ...over,
});

/** A perf brief whose criterion holds a number. */
export const PERF_ANSWER = answer({
  criteria: [{ name: "Faster", statement: "a second request takes under 5 ms", proof: "the timing", severity: "blocking" }],
});

/**
 * A checkout with the pack, a reproduction that fails, a model answering the brief then a CLEAR review, a built
 * index, and a human answering `script` in turn (null: unanswered); each question records the brief as it stood.
 */
export function devChangeSetup(script: Array<string | null> = []) {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["workbench/", ".orkeon/", "src/"]);
  files.listings.set(W, ["cache/"]);
  files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK);
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE])] = { stdout: ".orkeon/config.json\n" };
  shell.results[CMD] = { exitCode: 1, stdout: "not ok 1 - reads once\n# fail 1" };
  const llm = new FakeLlm();
  llm.extractions = [answer(), CLEAR];
  llm.answers = ["CLEAR"];
  const index = new FakeCodeIndex();
  index.roots = 1;
  const asked: Array<{ prompt: string; briefThen: string }> = [];
  const next = (prompt: string): string | null => {
    asked.push({ prompt, briefThen: files.files.get(BRIEF) ?? "" });
    return script.length === 0 ? null : script.shift() ?? null;
  };
  const human: HumanInput = {
    async choice(p) { const a = next(p); return a === null ? { answered: false } : { answered: true, value: a }; },
    async text(p) { const a = next(p); return a === null ? { answered: false } : { answered: true, value: a }; },
    async multi() { return { answered: false }; },
  };
  const log = new FakeLogger();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  let t = 0;
  const clock = () => new Date(2026, 9, 24, 9, 0, 0, (t += 1500));
  const deps = { files, shell, llm, config, index, human, log, clock };
  return { files, shell, llm, index, asked, deps };
}
export type Setup = ReturnType<typeof devChangeSetup>;

export const bug: DevChangeInputs = { code: "cache", kind: "bug", run: CMD, text: "The symbol map is read from disk on every call." };
export const refactor: DevChangeInputs = { code: "cache", kind: "refactor", text: "The symbol map is read from disk on every call." };

/** Runs runDevChange on `input` over the setup's deps. */
export const run = (f: Setup, input: DevChangeInputs = bug) => runDevChange(input, f.deps);

/** The issue gh returns for #42. */
export const ISSUE_42 = JSON.stringify({ number: 42, title: "Map reread", body: "Every call rereads.", url: "https://x/42" });

/** A code index holding a source symbol, a test named by a sentence and a test of a C# class. */
export const KNOWN_INDEX = { entries: [
  { path: "src/account.ts", line: 3, name: "Account" },
  { path: "tests/run.test.ts", line: 9, name: "loads an absent map" },
  { path: "tests/AccountTests.cs", line: 12, name: "Withdraw_refuses_an_overdraft" },
] };

export interface KnownCase {
  test: string;
  known: boolean;
}

/** A test by its name, the last segment of its qualified name, or its file. */
export const KNOWN_BY_NAME: readonly KnownCase[] = [
  { test: "loads an absent map", known: true },
  { test: "AccountTests.Withdraw_refuses_an_overdraft", known: true },
  { test: "tests/run.test.ts", known: true },
  { test: "run.test.ts", known: true },
];

/** Parts of names, and a file joined to its test's name. */
export const PARTS_OF_NAMES: readonly KnownCase[] = [
  { test: "AccountTests.never_written", known: false },
  { test: "Acc", known: false },
  { test: "loads an absent map twice", known: false },
  { test: "run", known: false },
  { test: "tests/run.test.ts::loads an absent map", known: true },
];

/** Last segments another class or file holds, and the ones of the class the index shows. */
export const OTHER_CLASSES: readonly KnownCase[] = [
  { test: "PaymentTests.Withdraw_refuses_an_overdraft", known: false },
  { test: "Billing.PaymentTests.Withdraw_refuses_an_overdraft", known: false },
  { test: "tests/other.test.ts::loads an absent map", known: false },
  { test: "Bank.AccountTests.Withdraw_refuses_an_overdraft", known: true },
  { test: "tests/AccountTests.cs::Withdraw_refuses_an_overdraft", known: true },
  { test: "Withdraw_refuses_an_overdraft", known: true },
];
