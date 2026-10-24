// runDevChange over FakeFiles, FakeShell, FakeCodeIndex, FakeLlm and a scripted HumanInput: a bug reproduced by
// running before anything else is written (its output in repro-<code>.txt, its facts in § 2), its questions asked
// and written one at a time; a bug that does not reproduce stops with nothing else written; a command outside the
// pack refused; a perf change measured; a refactor whose pin the index does not show turned unpinned; a feature
// routed to /dev-spec; an issue read by gh; the unattended run BLOCKED.
// Run:  node --test src/crews/dev-change/application/run-dev-change.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { FakePrecedents, PRECEDENTS_SAMPLE } from "../../../../tests/doubles/fake-precedents.ts";

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
import { parseDecisions, parseOpenQuestions } from "../../../shared/domain/dev/questions.ts";
import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";
import type { ChangeAnswer } from "../domain/change-answer.ts";
import { DEV_CHANGE_NEXT, FEATURE_LINE, knownIn, runDevChange } from "./run-dev-change.ts";
import type { DevChangeInputs } from "./run-dev-change.ts";
import { REPRO_TIMEOUT_SECONDS, issueCommand } from "./evidence.ts";

const PACK = readFileSync(new URL("../../../../tests/fixtures/dev/plan/pack.yaml", import.meta.url), "utf8");
const W = "/workspace/workbench";
const CODE = `${W}/cache`;
const BRIEF = `${CODE}/CHANGE-cache.md`;
const REPRO = `${CODE}/repro-cache.txt`;
const CMD = "node --test tests/symbol-map.test.ts";
const CLEAR = { verdict: "CLEAR", rows: [] };

const answer = (over: Partial<ChangeAnswer> = {}): ChangeAnswer => ({
  route: "change", name: "The symbol map is read on every call",
  summary: "A second request for the symbol map reads the file again.",
  evidence: ["src/map.ts:12 reads the file on each call"], suspected: "",
  criteria: [{ name: "The map is read once", statement: "a second request reads no file", proof: "the reproduction turns green", severity: "blocking" }],
  mustNotChange: [{ behaviour: "an absent map gives an empty map", pinnedBy: "loads an absent map" }],
  scope: [], constraints: [], assumptions: [],
  questions: [{ severity: "Blocking", question: "Does a changed file reload the map?", impact: "CH-01", options: ["Yes", "No"] }],
  ...over,
});

function setup(script: Array<string | null> = []) {
  const files = new FakeFiles();
  files.listings.set("/workspace", ["workbench/", ".orkeon/", "src/"]);
  files.listings.set(W, ["cache/"]);
  files.files.set("/workspace/.orkeon/repo.yaml", PACK);
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
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
type Setup = ReturnType<typeof setup>;
const bug: DevChangeInputs = { code: "cache", kind: "bug", run: CMD, text: "The symbol map is read from disk on every call." };
const run = (f: Setup, input: DevChangeInputs = bug) => runDevChange(input, f.deps);

describe("runDevChange — a bug", () => {
  it("runs the reproduction first, writes its output and facts, asks and records the answer, ends on /dev-plan", async () => {
    const f = setup(["Yes"]);
    f.llm.extractions = [answer(), answer({ questions: [] }), CLEAR];
    const text = await run(f);
    strictEqual(f.files.writes[0].path, REPRO, "the reproduction's output is written first");
    ok(f.files.files.get(REPRO)?.includes("exit: 1"));
    deepStrictEqual(f.shell.calls.find((c) => c.command === CMD)?.options, { timeoutSeconds: REPRO_TIMEOUT_SECONDS });
    for (const w of f.files.writes) ok(w.path.startsWith(`${CODE}/`), w.path);
    const brief = f.files.files.get(BRIEF) ?? "";
    const parsed = parsePlanSource(brief, "change");
    strictEqual(parsed.changeKind, "bug");
    deepStrictEqual(parsed.ids.map((i) => i.id), ["CH-01"]);
    ok(brief.includes(`- **Reproduction**: \`${CMD}\` — exit 1`), brief);
    ok(brief.includes("> The symbol map is read from disk on every call."));
    deepStrictEqual(parseDecisions(f.asked[0].briefThen), []);
    deepStrictEqual(parseDecisions(brief).map((d) => [d.id, d.answer]), [["Q1", "Yes"]]);
    deepStrictEqual(parseOpenQuestions(brief), []);
    ok(text.includes("warning: 'loads an absent map' is no test the code index shows: its row reads unpinned"), text);
    strictEqual(parsed.mustNotChange[0].pinnedBy, null);
    strictEqual(text.split("\n").at(-1), DEV_CHANGE_NEXT.replace("{code}", "cache"));
  });

  it("stops when the bug does not reproduce: only the output is written, no model call for the brief", async () => {
    const f = setup();
    f.shell.results[CMD] = { exitCode: 0, stdout: "ok 1" };
    const text = await run(f);
    ok(text.startsWith("dev-change: the bug did not reproduce"), text);
    deepStrictEqual(f.files.writes.map((w) => w.path), [REPRO]);
    strictEqual(f.llm.extracts.length, 0);
  });

  it("stops on a timeout and refuses a command outside the pack before running anything", async () => {
    const f = setup();
    f.shell.results[CMD] = { timedOut: true, exitCode: -1 };
    ok((await run(f)).includes(`ran out of its ${REPRO_TIMEOUT_SECONDS} s`));
    const g = setup();
    const text = await run(g, { ...bug, run: "rm -rf / ; true" });
    ok(text.startsWith('dev-change: --run "rm -rf / ; true" may not run'), text);
    ok(!g.shell.commands.includes("rm -rf / ; true"));
    strictEqual(g.files.writes.length, 0);
  });

  it("refuses a command of the pack the step's rule sets deny, before running it", async () => {
    const f = setup();
    f.files.files.set("/workspace/.orkeon/repo.yaml", PACK.replace("  test: npm test\n", "  test: npm test\n  cli: node bin/cli.js\n"));
    const denied = "node bin/cli.js git add src";
    const text = await run(f, { ...bug, run: denied });
    strictEqual(text, `dev-change: the rules of this step deny the shell command '${denied}'; nothing is written`);
    ok(!f.shell.commands.includes(denied));
    strictEqual(f.files.writes.length, 0);
  });

  it("asks the model for the command when --run is absent, and checks it", async () => {
    const f = setup([null]);
    f.llm.extractions = [{ command: "npm test", why: "all" }, { command: CMD, why: "the map test" }, answer(), CLEAR];
    const text = await run(f, { ...bug, run: undefined });
    ok(f.llm.extracts[1].prompt.includes("'npm test':"), "the refused command is named on the re-ask");
    ok(f.shell.commands.includes(CMD));
    ok(text.includes("dev-change: BLOCKED — a question went unanswered"), text);
    deepStrictEqual(parseOpenQuestions(f.files.files.get(BRIEF) ?? "").map((q) => q.id), ["Q1"]);
    strictEqual(f.llm.acts.length, 0, "no review on a blocked run");
  });
});

describe("runDevChange — failures", () => {
  it("reports a write of the brief that fails as such, and lets a question that fails go up as it is", async () => {
    const refactor: DevChangeInputs = { code: "cache", kind: "refactor", text: "The symbol map is read from disk on every call." };
    const f = setup(["Yes"]);
    f.deps.llm.extractions = [answer(), CLEAR];
    f.files.write = async () => { throw new Error("disk full"); };
    ok((await runDevChange(refactor, f.deps)).startsWith("dev-change: workbench/cache/CHANGE-cache.md could not be written (disk full)"));
    const g = setup();
    g.deps.llm.extractions = [answer(), CLEAR];
    g.deps.human.choice = async () => { throw new Error("the question was cancelled"); };
    await rejects(runDevChange(refactor, g.deps), /the question was cancelled/);
  });
});

describe("runDevChange — other kinds and origins", () => {
  it("measures a perf change and needs a number in a criterion", async () => {
    const f = setup([null]);
    f.llm.extractions = [answer(), answer({ criteria: [{ name: "Faster", statement: "a second request takes under 5 ms", proof: "the timing", severity: "blocking" }] }), CLEAR];
    f.shell.results[CMD] = { exitCode: 0, stdout: "ok 1 - 12 ms" };
    const text = await run(f, { ...bug, kind: "perf" });
    ok(f.llm.extracts[1].prompt.includes("a performance change has a criterion with a number"));
    ok((f.files.files.get(BRIEF) ?? "").includes(`- **Measured**: \`${CMD}\``), "the measurement is a fact of § 2");
    ok(text.startsWith("dev-change: workbench/cache/CHANGE-cache.md written — perf"), text);
    const g = setup();
    ok((await run(g, { ...bug, kind: "perf" })).startsWith("dev-change: the measurement failed"));
  });

  it("routes a feature to /dev-spec and writes no brief", async () => {
    const f = setup();
    f.llm.extractions = [answer({ route: "feature" })];
    const text = await run(f, { code: "cache", kind: "refactor", text: "Add a cache browser screen." });
    strictEqual(text.split("\n").at(-1), FEATURE_LINE.replace("{code}", "cache"));
    strictEqual(f.files.writes.length, 0);
  });

  it("reads an issue by gh, and stops with the way out when gh fails", async () => {
    const f = setup([null]);
    f.shell.results[issueCommand("42")] = { stdout: JSON.stringify({ number: 42, title: "Map reread", body: "Every call rereads.", url: "https://x/42" }) };
    await run(f, { code: "cache", kind: "refactor", text: "#42" });
    ok((f.files.files.get(BRIEF) ?? "").includes("From issue #42:"));
    ok(f.llm.extracts[0].prompt.includes("Every call rereads."));
    const g = setup();
    g.shell.results[issueCommand("42")] = { exitCode: 1, stderr: "not logged in" };
    ok((await run(g, { code: "cache", kind: "refactor", text: "#42" })).includes("failed (not logged in)"));
  });

  it("refuses a refactor without a protected behaviour, a code holding a spec, and --run on a refactor", async () => {
    const f = setup([null]);
    f.llm.extractions = [answer({ mustNotChange: [] })];
    ok((await run(f, { code: "cache", kind: "refactor", text: "x" })).startsWith("dev-change: the brief was refused twice"));
    const g = setup();
    g.files.listings.set(CODE, ["SPEC-cache.md"]);
    ok((await run(g)).startsWith("dev-change: workbench/cache/SPEC-cache.md exists"));
    ok((await run(setup(), { ...bug, kind: "refactor" })).startsWith("dev-change: --run is for a bug or a perf change"));
  });

  it("T1: recalls decisions and methods from the code, the kind and the origin, the block in the brief's extract, named at the end", async () => {
    const f = setup(["Yes"]);
    f.llm.extractions = [answer(), answer({ questions: [] }), CLEAR];
    const precedents = FakePrecedents.hits();
    const text = await runDevChange(bug, { ...f.deps, precedents: precedents.recall });
    deepStrictEqual(precedents.calls.map((c) => c.trigger), ["T1"]);
    ok(precedents.calls[0].query.startsWith("cache — bug — The symbol map is read from disk on every call."), precedents.calls[0].query);
    const briefs = f.llm.extracts.filter((e) => e.prompt.includes("What the code index found for the change"));
    ok(briefs.length >= 1);
    for (const b of briefs) ok(b.prompt.trimEnd().endsWith(PRECEDENTS_SAMPLE), b.prompt.slice(-300));
    ok(text.includes("precedents recalled: shop-mistake-20261022-n-plus-one"), text);
  });

  it("T1: no block and no line when nothing is recalled", async () => {
    const f = setup(["Yes"]);
    f.llm.extractions = [answer(), answer({ questions: [] }), CLEAR];
    const text = await runDevChange(bug, { ...f.deps, precedents: new FakePrecedents().recall });
    for (const e of f.llm.extracts) ok(!e.prompt.includes("## Precedents"));
    ok(!text.includes("precedents recalled"), text);
  });
});

describe("knownIn", () => {
  const known = knownIn({ entries: [
    { path: "src/account.ts", line: 3, name: "Account" },
    { path: "tests/run.test.ts", line: 9, name: "loads an absent map" },
    { path: "tests/AccountTests.cs", line: 12, name: "Withdraw_refuses_an_overdraft" },
  ] });

  it("knows a test by its name, the last segment of its qualified name, or its file", () => {
    strictEqual(known("loads an absent map"), true);
    strictEqual(known("AccountTests.Withdraw_refuses_an_overdraft"), true);
    strictEqual(known("tests/run.test.ts"), true);
    strictEqual(known("run.test.ts"), true);
  });

  it("does not take a part of a name for the name", () => {
    strictEqual(known("AccountTests.never_written"), false);
    strictEqual(known("Acc"), false);
    strictEqual(known("loads an absent map twice"), false);
    strictEqual(known("run"), false);
    // A path is one name: its extension is not a segment (`ts` would match an entry named so).
    strictEqual(knownIn({ entries: [{ path: "src/x.ts", line: 1, name: "ts" }] })("tests/a.test.ts"), false);
    strictEqual(known("tests/run.test.ts::loads an absent map"), true);
  });

  it("does not take a last segment another class holds for the name", () => {
    strictEqual(known("PaymentTests.Withdraw_refuses_an_overdraft"), false);
    strictEqual(known("Billing.PaymentTests.Withdraw_refuses_an_overdraft"), false);
    strictEqual(known("tests/other.test.ts::loads an absent map"), false);
    strictEqual(known("Bank.AccountTests.Withdraw_refuses_an_overdraft"), true);
    strictEqual(known("tests/AccountTests.cs::Withdraw_refuses_an_overdraft"), true);
    strictEqual(known("Withdraw_refuses_an_overdraft"), true);
  });
});
