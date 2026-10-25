// runDevBatches over the fixture work folder tests/fixtures/dev/workbench/demo/ (F1 done, F2 after F1,
// F3 alone), FakeFiles and a scripted git: the run record, the launch of the next batch, the log, the
// resume after a kill, a stop, the review of a batch whose dependencies closed, and the close of the
// plan with one push and one pull request. Run:
//   node --test src/crews/dev-batches/application/run-dev-batches.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { parseBatchesState } from "../../../shared/domain/dev/batches-state.ts";
import {
  GIT_COMMITTER_IDENT_COMMAND, GIT_CURRENT_BRANCH_COMMAND, GIT_DEFAULT_BRANCH_COMMAND, GIT_HEAD_COMMAND, GIT_IDENT_COMMAND,
  gitPushCommand,
  gitPushedCheckCommand,
} from "../../../shared/domain/git/close.ts";
import { appendToLog, closedLine } from "../domain/batches-log.ts";
import { ACTIVE_RECORD, batchesBranchName, runDevBatches } from "./run-dev-batches.ts";
import type { BatchesAnswer, DevBatchesDeps } from "./run-dev-batches.ts";

const DEMO_DIR = fileURLToPath(new URL("../../../../tests/fixtures/dev/workbench/demo/", import.meta.url));
const DIR = "/workspace/workbench/demo";
const PLAN = `${DIR}/DEMO-PLAN.md`;
const LOG = "/workspace/.orkeon/dev/demo/batches-state.md";
const IDENT = { stdout: "Ada <ada@example.org> 1761300000 +0000\n" };

function setup(branch = "feat/demo") {
  const files = new FakeFiles();
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`${DIR}/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  files.listings.set("/workspace", ["workbench"]);
  files.listings.set("/workspace/workbench", ["demo"]);
  files.listings.set(DIR, names);
  const shell = new FakeShell();
  shell.results[GIT_IDENT_COMMAND] = IDENT;
  shell.results[GIT_COMMITTER_IDENT_COMMAND] = IDENT;
  shell.results[GIT_CURRENT_BRANCH_COMMAND] = { stdout: `${branch}\n` };
  shell.results[GIT_DEFAULT_BRANCH_COMMAND] = { stdout: "origin/main\n" };
  shell.results[GIT_HEAD_COMMAND] = { stdout: "abc1234\n" };
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  let minute = 0;
  const deps: DevBatchesDeps = {
    files, shell, config, log: new FakeLogger(), clock: () => new Date(Date.UTC(2026, 9, 24, 8, minute++)),
  };
  return { files, shell, deps };
}

const parse = (text: string): BatchesAnswer => JSON.parse(text) as BatchesAnswer;
const markDone = (files: FakeFiles, batch: string): void => {
  const plan = files.files.get(PLAN)!;
  files.files.set(PLAN, plan.replace(new RegExp(`(### Batch ${batch} — [^\\n]*?) — open`), "$1 — done (2026-10-24)"));
};
/** F1 open again, in the plan and its sheet: the plan's three batches all to run. */
const reopenF1 = (files: FakeFiles): void => {
  files.files.set(PLAN, files.files.get(PLAN)!.replace("### Batch F1 — Parsers — done (2026-10-20)", "### Batch F1 — Parsers — open"));
  const sheet = `${DIR}/DEMO-PLAN-F1.md`;
  files.files.set(sheet, files.files.get(sheet)!.replace("# DEMO-PLAN-F1 — Parsers — done (2026-10-20)", "# DEMO-PLAN-F1 — Parsers")
    .replace(/^Done \(2026-10-20\).*$/m, ""));
};
const VALID_F2 = "# DEMO-VERIFY-F2 — 2026-10-24 09:00 — fast\n\n## Verdict — VALID\n\nValidations: `npm test` — exit 0, whole suite\n";
/** F2 done, F3 launched: back from F3, the plan closes. */
async function toTheClose(files: FakeFiles, deps: DevBatchesDeps, first: Record<string, unknown> = {}): Promise<BatchesAnswer> {
  await runDevBatches({ code: "demo", ...first }, deps);
  markDone(files, "F2");
  await runDevBatches({ after: [] }, deps);
  markDone(files, "F3");
  return parse(await runDevBatches({ after: [] }, deps));
}
const events = (files: FakeFiles): string[] =>
  parseBatchesState(files.files.get(LOG) ?? "").entries.map((e) => `${e.batch ?? ""} ${e.event}`.trim());

describe("runDevBatches — a run", () => {
  it("records the run, logs the next batch launched and names it for /dev-implement with the dispatch's context", async () => {
    const { files, deps } = setup();
    const out = parse(await runDevBatches(
      { code: "demo", pr: true, permissionMode: "default", permissionRules: ["Bash(git push*)"], githubTool: true, hooks: [], effort: "high" },
      deps,
    ));
    strictEqual(out.next?.crew, "dev-implement");
    deepStrictEqual(out.next?.input, {
      batch: "F2", plan: "demo", hooks: [], effort: "high", permissionMode: "default", permissionRules: ["Bash(git push*)"],
      githubTool: false, steps: 2,
    });
    ok(out.lines.includes("review of F2: not run (no reviewer on this host)"), out.lines.join("\n"));
    ok(out.lines.some((l) => l.startsWith("→ F2 launched (2/3)")), out.lines.join("\n"));
    deepStrictEqual(events(files), ["F2 launched"]);
    const record = JSON.parse(files.files.get(ACTIVE_RECORD)!);
    deepStrictEqual([record.code, record.pr, record.context.effort], ["demo", true, "high"]);
  });

  it("goes on without a code from the run record, and says when there is none", async () => {
    const { deps } = setup();
    deepStrictEqual(parse(await runDevBatches({}, deps)).lines, ["no /dev-batches run to go on with: /dev-batches <code>"]);
    await runDevBatches({ code: "demo", effort: "low" }, deps);
    const again = parse(await runDevBatches({}, deps));
    strictEqual(again.next?.input.batch, "F2");
    strictEqual(again.next?.input.effort, "low");
  });

  it("refuses another plan while a run is in progress, its record kept", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    const out = parse(await runDevBatches({ code: "other" }, deps));
    deepStrictEqual(out.lines, [
      "BLOCKED — the run of demo is in progress (.orkeon/dev/batches-active.json): take it to its close (/dev-batches demo), " +
      "or delete that file to drop it, then /dev-batches other",
    ]);
    strictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!).code, "demo");
  });

  it("does not refuse another plan over a record whose run's log is closed", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    files.files.set(LOG, appendToLog(null, "demo", [closedLine(new Date(Date.UTC(2026, 9, 24, 10)))]));
    const out = parse(await runDevBatches({ code: "other" }, deps));
    strictEqual(out.lines.some((l) => l.includes("is in progress")), false, out.lines.join("\n"));
    ok(out.lines.at(-1)!.startsWith("BLOCKED — no plan under workbench/other/"), out.lines.join("\n"));
  });

  it("refuses a read-only session mode, and a code that is not a folder name", async () => {
    const { deps } = setup();
    ok(parse(await runDevBatches({ code: "demo", permissionMode: "plan" }, deps)).lines.at(-1)!.startsWith("BLOCKED — the session mode plan"));
    ok(parse(await runDevBatches({ code: "../x" }, deps)).lines[0].startsWith("BLOCKED — '../x' is not a work code"));
  });

  it("runs concurrency 1 as the sequential run, and refuses a bad value before reading or writing anything", async () => {
    const one = setup();
    const out = parse(await runDevBatches({ code: "demo", concurrency: 1 }, one.deps));
    const plain = setup();
    deepStrictEqual(out, parse(await runDevBatches({ code: "demo" }, plain.deps)));
    ok(!("concurrency" in (out.next?.input ?? {})));
    ok(!("concurrency" in JSON.parse(one.files.files.get(ACTIVE_RECORD)!).context));
    for (const concurrency of [5, 0, "x"]) {
      const { files, shell, deps } = setup();
      const before = new Map(files.files);
      const refused = parse(await runDevBatches({ code: "demo", concurrency }, deps));
      strictEqual(refused.lines.length, 1);
      ok(refused.lines[0].startsWith("BLOCKED — concurrency "), refused.lines[0]);
      strictEqual(refused.next, undefined);
      deepStrictEqual(files.files, before);
      deepStrictEqual(shell.commands, []);
    }
  });

  it("killed during a batch and run again, relaunches the first batch not done, without a second review", async () => {
    const { files, deps } = setup();
    const llm = new FakeLlm();
    llm.extractions = [{ verdict: "CLEAR", rows: [] }];
    await runDevBatches({ code: "demo" }, { ...deps, reviewerFor: () => llm });
    strictEqual(llm.acts.length, 1);
    const again = parse(await runDevBatches({ code: "demo" }, { ...deps, reviewerFor: () => llm }));
    strictEqual(again.next?.input.batch, "F2");
    ok(again.lines.some((l) => l.startsWith("→ F2 relaunched")), again.lines.join("\n"));
    strictEqual(llm.acts.length, 1);
    deepStrictEqual(events(files), ["F2 launched", "F2 relaunched"]);
  });
});

describe("runDevBatches — back from a batch", () => {
  it("runs a three-batch plan to one push and one pull request, each commit named by its close", async () => {
    const { files, shell, deps } = setup();
    reopenF1(files);
    strictEqual(parse(await runDevBatches({ code: "demo" }, deps)).next?.input.batch, "F1");
    markDone(files, "F1");
    const second = parse(await runDevBatches({ after: ["✓ committed 1111111 on feat/demo: 2 file(s)"] }, deps));
    strictEqual(second.next?.input.batch, "F2");
    markDone(files, "F2");
    const third = parse(await runDevBatches({ after: ["✓ committed 2222222 on feat/demo: 1 file(s)"] }, deps));
    strictEqual(third.next?.input.batch, "F3");
    ok(third.lines.includes("✓ F2 done and committed"));
    markDone(files, "F3");
    const f3 = `${DIR}/DEMO-PLAN-F3.md`;
    files.files.set(f3, `${files.files.get(f3)!}\n## Assumptions\n| # | Assumption | To be validated by |\n|---|---|---|\n| H1 | ids are stable | the user |\n`);
    const last = parse(await runDevBatches({ after: ["→ F3 committed"] }, deps));
    strictEqual(last.next, undefined);
    deepStrictEqual(events(files), ["F1 launched", "F1 returned", "F1 merged", "F2 launched", "F2 returned", "F2 merged",
      "F3 launched", "F3 returned", "F3 merged", "closed"]);
    deepStrictEqual(parseBatchesState(files.files.get(LOG)!).entries.filter((e) => e.event === "merged").map((e) => e.detail),
      ["1111111", "2222222", "abc1234"]);
    strictEqual(shell.commands.filter((c) => c === gitPushCommand("feat/demo")).length, 1);
    ok(last.lines.includes("✓ pushed feat/demo to origin"), last.lines.join("\n"));
    const body = files.writes.find((w) => w.path.endsWith("/PR.md"))?.content ?? "";
    ok(body.includes("## Assumptions to validate\n\n| Id | Assumption | To be validated by |\n|----|------------|--------------------|\n| F3 H1 | ids are stable | the user |\n"), body);
    deepStrictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!), { code: null });
    // Closed: a run again says so and pushes nothing more.
    const closed = parse(await runDevBatches({ code: "demo" }, deps));
    ok(closed.lines.at(-1)!.includes("every batch is done and the run is closed"), closed.lines.join("\n"));
    strictEqual(shell.commands.filter((c) => c === gitPushCommand("feat/demo")).length, 1);
  });

  it("stops on a batch the chain left not done: logged, and a human decides", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    const out = parse(await runDevBatches({ after: ["", "BLOCKED — step 2: the tests stay red"] }, deps));
    strictEqual(out.next, undefined);
    ok(out.lines.includes("F2 stopped BLOCKED — step 2: the tests stay red"), out.lines.join("\n"));
    deepStrictEqual(events(files), ["F2 launched", "F2 stopped"]);
    // Typed again, the run relaunches it.
    strictEqual(parse(await runDevBatches({ code: "demo" }, deps)).next?.input.batch, "F2");
  });

  it("stops on the audit's own BLOCKED line, even with a GAPS verdict written for an unfinished audit", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    const line = "dev-verify: BLOCKED — the step's budget is spent (tokens: x): the capture stays in c/; GAPS written to v";
    const out = parse(await runDevBatches({ after: ["", line] }, deps));
    ok(out.lines.includes("F2 stopped BLOCKED — the step's budget is spent (tokens: x): the capture stays in c/; GAPS written to v"),
      out.lines.join("\n"));
    deepStrictEqual(events(files), ["F2 launched", "F2 stopped"]);
  });

  it("takes a batch committed but not marked done for done: logged merged, said, never launched again", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    const after = ["✓ committed 3333333 on feat/demo: 1 file(s)", "⚠ DEMO-PLAN-F2.md could not be marked done: EACCES"];
    const out = parse(await runDevBatches({ after }, deps));
    ok(out.lines.includes("⚠ F2 is not marked done in its sheet or the plan: mark it by hand"), out.lines.join("\n"));
    strictEqual(out.next?.input.batch, "F3");
    deepStrictEqual(events(files), ["F2 launched", "F2 returned", "F2 merged", "F3 launched"]);
    // Typed again later, F2 (its sheet still open) is not relaunched.
    strictEqual(parse(await runDevBatches({ code: "demo" }, deps)).next?.input.batch, "F3");
  });

  it("does not launch a batch whose review raises a Blocking question", async () => {
    const { files, deps } = setup();
    const llm = new FakeLlm();
    llm.extractions = [{ verdict: "GAPS", rows: [{ severity: "Blocking", question: "Does F2 still read the parsers F1 gave?", evidence: "DEMO-PLAN-F2.md:6", target: "F2" }] }];
    const out = parse(await runDevBatches({ code: "demo" }, { ...deps, reviewerFor: () => llm }));
    strictEqual(out.next, undefined);
    ok(out.lines.includes("review of F2: GAPS — 1 Blocking, 0 Major"), out.lines.join("\n"));
    deepStrictEqual(events(files), ["F2 stopped"]);
    // Settled and typed again: launched without a second review.
    strictEqual(parse(await runDevBatches({ code: "demo" }, { ...deps, reviewerFor: () => llm })).next?.input.batch, "F2");
    strictEqual(llm.acts.length, 1);
  });

  it("closes on the default branch without contrib.branch, and refuses it with one while the run's branch exists", async () => {
    const plain = setup("main");
    const closed = await toTheClose(plain.files, plain.deps);
    ok(closed.lines.some((l) => l.startsWith("✓ every batch is committed on main, the default branch")), closed.lines.join("\n"));
    const absent = setup("main");
    absent.files.files.set("/workspace/.orkeon/repo.yaml", "contrib:\n  branch: feat|fix/<slug>\n");
    absent.shell.results["git rev-parse --verify --quiet 'refs/heads/feat/demo'"] = { exitCode: 1 };
    const said = await toTheClose(absent.files, absent.deps);
    ok(said.lines.includes("⚠ the pack asks for a work branch (feat|fix/<slug>), but the batches are committed on main"), said.lines.join("\n"));
    ok(said.lines.some((l) => l.startsWith("✓ every batch is committed on main, the default branch")), said.lines.join("\n"));
    const packed = setup("main");
    packed.files.files.set("/workspace/.orkeon/repo.yaml", "contrib:\n  branch: feat|fix/<slug>\n");
    packed.shell.results["git rev-parse --verify --quiet 'refs/heads/feat/demo'"] = { exitCode: 1 };
    await runDevBatches({ code: "demo" }, packed.deps);
    packed.shell.results["git rev-parse --verify --quiet 'refs/heads/feat/demo'"] = { exitCode: 0 };
    markDone(packed.files, "F2");
    await runDevBatches({ after: [] }, packed.deps);
    markDone(packed.files, "F3");
    const refused = parse(await runDevBatches({ after: [] }, packed.deps));
    ok(refused.lines.includes(
      "✗ close: main is the default branch and the pack asks for a work branch (feat|fix/<slug>): git switch feat/demo, then /dev-batches demo",
    ), refused.lines.join("\n"));
    ok(!events(packed.files).includes("closed"));
    strictEqual(JSON.parse(packed.files.files.get(ACTIVE_RECORD)!).code, "demo");
  });

  it("on the default branch with contrib.branch, creates the run's branch before the launch", async () => {
    const { files, shell, deps } = setup("main");
    files.files.set("/workspace/.orkeon/repo.yaml", "contrib:\n  branch: feat|fix/<slug>\n");
    shell.results["git rev-parse --verify --quiet 'refs/heads/feat/demo'"] = { exitCode: 1 };
    const out = parse(await runDevBatches({ code: "demo" }, deps));
    ok(shell.commands.includes("git switch -c 'feat/demo'"), shell.commands.join("\n"));
    strictEqual(out.next?.input.batch, "F2");
  });
});

describe("runDevBatches — what comes back and the close", () => {
  it("logs a GAPS verdict as returned, and stops", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    const out = parse(await runDevBatches({ after: ["→ /dev-implement F2 — correction: Major Scope: y"] }, deps));
    strictEqual(out.next, undefined);
    ok(out.lines.includes("F2 returned GAPS"), out.lines.join("\n"));
    ok(out.lines.includes("→ a human decides: the correction the audit names (/dev-implement F2 demo — correction: <finding>), then /dev-batches demo goes on"),
      out.lines.join("\n"));
  });

  it("typed after a hop the chain's depth refused, logs what the audit written since the launch says", async () => {
    const gaps = setup();
    await runDevBatches({ code: "demo" }, gaps.deps);
    const verdict = `${DIR}/DEMO-VERIFY-F2.md`;
    // The fixture's verdict file holds two GAPS audits before the launch: a third one is written since.
    gaps.files.files.set(verdict, `${gaps.files.files.get(verdict)}\n${gaps.files.files.get(verdict)?.split("\n\n# ")[1].replace(/^/, "# ")}`);
    const out = parse(await runDevBatches({}, gaps.deps));
    strictEqual(out.next, undefined);
    ok(out.lines.includes("F2 returned GAPS"), out.lines.join("\n"));
    deepStrictEqual(events(gaps.files), ["F2 launched", "F2 returned"]);
    const valid = setup();
    await runDevBatches({ code: "demo" }, valid.deps);
    valid.files.files.set(verdict, `${valid.files.files.get(verdict)}\n${VALID_F2}`);
    // A VALID audit and no commit: its chain may still be closing it, so nothing is logged (the chain's answer would
    // find the batch stopped); the close by hand is named.
    const typed = parse(await runDevBatches({}, valid.deps));
    strictEqual(typed.next, undefined);
    ok(typed.lines.includes("F2: an audit since its launch says VALID, and no commit yet: its chain may still be closing it (nothing logged)"),
      typed.lines.join("\n"));
    ok(typed.lines.includes("→ wait for the chain's answer; else the close (/dev-implement F2 demo --close), then /dev-batches demo goes on"),
      typed.lines.join("\n"));
    deepStrictEqual(events(valid.files), ["F2 launched"]);
  });

  it("typed over an audit with no verdict since the launch, logs the stop: a dead chain never answers, a human decides", async () => {
    const t = setup();
    await runDevBatches({ code: "demo" }, t.deps);
    const verdict = `${DIR}/DEMO-VERIFY-F2.md`;
    t.files.files.set(verdict, `${t.files.files.get(verdict) ?? ""}\n# DEMO-VERIFY-F2 — 2026-10-24 11:00 — fast\n\nAudit in progress.\n`);
    const typed = parse(await runDevBatches({}, t.deps));
    ok(!typed.lines.some((l) => l.includes("nothing logged")), typed.lines.join("\n"));
    // What the last verdict read says is logged (here the earlier GAPS of the fixture): never a silent wait.
    strictEqual(events(t.files).length, 2);
  });

  it("typed after a cut with no audit since the launch, relaunches the batch; an audit before the launch is not one", async () => {
    const { files, deps } = setup();
    files.files.set(`${DIR}/DEMO-VERIFY-F2.md`, VALID_F2);
    await runDevBatches({ code: "demo" }, deps);
    ok((files.files.get(LOG) ?? "").includes("F2 launched audits 1"), files.files.get(LOG));
    strictEqual(parse(await runDevBatches({}, deps)).next?.input.batch, "F2");
    deepStrictEqual(events(files), ["F2 launched", "F2 relaunched"]);
  });

  it("logs a VALID batch its close did not commit as a stop, with the close's ✗ line", async () => {
    const { files, deps } = setup();
    files.files.set(`${DIR}/DEMO-VERIFY-F2.md`, VALID_F2);
    await runDevBatches({ code: "demo" }, deps);
    const out = parse(await runDevBatches({ after: ["✗ git commit failed: hook refused"] }, deps));
    ok(out.lines.includes("F2 stopped BLOCKED — close: git commit failed: hook refused"), out.lines.join("\n"));
  });

  it("keeps the commits local under a rule that denies the push, and closes the run", async () => {
    const { files, shell, deps } = setup();
    const out = await toTheClose(files, deps, { permissionMode: "default", permissionRules: ["deny shell_command command=git push*"] });
    ok(out.lines.includes("✗ not pushed: a session rule denies 'git push -u origin 'feat/demo''; the commits stay local"), out.lines.join("\n"));
    strictEqual(shell.commands.some((c) => c.startsWith("git push")), false);
    strictEqual(events(files).at(-1), "closed");
  });

  it("leaves the run open when the push fails, and tries again at the next run", async () => {
    const { files, shell, deps } = setup();
    shell.results[gitPushCommand("feat/demo")] = { exitCode: 1, stderr: "rejected\n" };
    const out = await toTheClose(files, deps);
    ok(out.lines.some((l) => l.startsWith("the run stays open: /dev-batches demo tries the push again")
      && l.includes("push from a terminal (git push -u origin 'feat/demo')")), out.lines.join("\n"));
    strictEqual(events(files).includes("closed"), false);
    shell.results[gitPushCommand("feat/demo")] = { exitCode: 0 };
    await runDevBatches({ code: "demo" }, deps);
    strictEqual(events(files).at(-1), "closed");
  });

  it("closes the run on a branch pushed by hand, without pushing it again", async () => {
    const { files, shell, deps } = setup();
    shell.results[gitPushCommand("feat/demo")] = { exitCode: 128, stderr: "fatal: could not read from remote\n" };
    await toTheClose(files, deps);
    strictEqual(events(files).includes("closed"), false);
    shell.results[gitPushedCheckCommand("feat/demo")] = { stdout: "abc123\nabc123\n" };
    const pushes = shell.commands.filter((c) => c === gitPushCommand("feat/demo")).length;
    const out = parse(await runDevBatches({ code: "demo" }, deps));
    ok(out.lines.includes("✓ feat/demo is on origin already"), out.lines.join("\n"));
    strictEqual(shell.commands.filter((c) => c === gitPushCommand("feat/demo")).length, pushes);
    strictEqual(events(files).at(-1), "closed");
  });

  it("does not overwrite the run in progress for a code that has no plan", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    // Refused before the plan is even looked for: another run is in progress.
    ok(parse(await runDevBatches({ code: "demi" }, deps)).lines.at(-1)!.startsWith("BLOCKED — the run of demo is in progress"));
    strictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!).code, "demo");
  });

  it("takes the context of a typed run without a code, and keeps the record's for a chained one", async () => {
    const { files, deps } = setup();
    await runDevBatches({ code: "demo", permissionMode: "default", effort: "low" }, deps);
    strictEqual(parse(await runDevBatches({ permissionMode: "default", effort: "high" }, deps)).next?.input.effort, "high");
    strictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!).context.effort, "high");
    ok(parse(await runDevBatches({ permissionMode: "plan" }, deps)).lines.at(-1)!.startsWith("BLOCKED — the session mode plan"));
    strictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!).context.permissionMode, "default");
  });

  it("launches nothing when its log cannot be written", async () => {
    const { files, deps } = setup();
    const write = files.write.bind(files);
    files.write = async (path: string, content: string) => { if (path === LOG) throw new Error("read-only"); return write(path, content); };
    const out = parse(await runDevBatches({ code: "demo" }, deps));
    strictEqual(out.next, undefined);
    ok(out.lines.at(-1)!.startsWith("BLOCKED — the log must be writable"), out.lines.join("\n"));
  });
});

describe("batchesBranchName", () => {
  it("takes the pattern's first prefix", () => {
    strictEqual(batchesBranchName("feat|fix/<slug>", "demo"), "feat/demo");
    strictEqual(batchesBranchName("<slug>", "demo"), null);
  });
});

/** F2 and F3 anchoring disjoint paths: one wave of two. */
function parallelSetup() {
  const at = setup();
  const anchors = (path: string) => `\n## Anchors\n\n| Step | Test class / fixture | Shared doubles and builders | Production filled or created |\n|------|----|----|----|\n| 1 — x | \`${path}.test.ts\` — to create | — | \`${path}.ts\` — to create |\n`;
  for (const [batch, path] of [["F2", "src/status"], ["F3", "docs/status"]]) {
    const sheet = `${DIR}/DEMO-PLAN-${batch}.md`;
    at.files.files.set(sheet, at.files.files.get(sheet)! + anchors(path));
  }
  for (const b of ["F2", "F3"]) {
    at.shell.results[`git rev-parse --verify --quiet 'refs/heads/batches/demo/${b}'`] = { exitCode: 1 };
    at.shell.results[`git -C '.orkeon/worktrees/demo-${b}' symbolic-ref -q HEAD`] = { stdout: `refs/heads/batches/demo/${b}\n` };
    at.shell.results[`git rev-parse --verify 'refs/heads/batches/demo/${b}'`] = { stdout: `beef${b.slice(1)}00\n` };
  }
  const runs: Array<{ batch: string; root: string; mode: string }> = [];
  at.deps.runBatch = async (run, context) => {
    runs.push({ batch: run.batch, root: run.root, mode: context.permissionMode });
    return { batch: run.batch, verdict: "VALID", hash: "1111111", lines: [], spent: 10 };
  };
  at.deps.probe = async (root) => ({ exitCode: 0, top: root });
  return { ...at, runs };
}

describe("runDevBatches — a parallel run", () => {
  it("runs the wave itself, both batches under their worktrees, and names itself next with the concurrency", async () => {
    const { files, deps, runs } = parallelSetup();
    const out = parse(await runDevBatches({ code: "demo", concurrency: 2, permissionMode: "bypassPermissions" }, deps));
    deepStrictEqual(runs, [
      { batch: "F2", root: "/workspace/.orkeon/worktrees/demo-F2", mode: "bypassPermissions" },
      { batch: "F3", root: "/workspace/.orkeon/worktrees/demo-F3", mode: "bypassPermissions" },
    ]);
    deepStrictEqual(out.next, { crew: "dev-batches", input: { concurrency: 2 } });
    deepStrictEqual(events(files), ["F2 launched", "F3 launched", "F2 returned", "F2 merged", "F3 returned", "F3 merged"]);
    strictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!).context.concurrency, 2);
  });

  it("refuses a mode that asks before shell commands, typed or read back by a chained run", async () => {
    for (const mode of ["default", "acceptEdits"]) {
      const { deps, runs } = parallelSetup();
      const out = parse(await runDevBatches({ code: "demo", concurrency: 2, permissionMode: mode }, deps));
      strictEqual(out.lines.at(-1), `BLOCKED — concurrency 2 refused: the session mode ${mode} asks before shell commands, and two batches would ask at once: /mode bypassPermissions, or run with --concurrency 1`);
      deepStrictEqual(runs, []);
    }
    const chained = parallelSetup();
    chained.files.files.set(ACTIVE_RECORD, JSON.stringify({ code: "demo", pr: false, context: { permissionMode: "acceptEdits", concurrency: 2 } }));
    const out = parse(await runDevBatches({ concurrency: 2 }, chained.deps));
    ok(out.lines.at(-1)!.startsWith("BLOCKED — concurrency 2 refused: the session mode acceptEdits"), out.lines.join("\n"));
  });

  it("goes on from the record's concurrency when a chained run is handed none: handed on with it, its budget sized to it", async () => {
    const { files, deps, runs } = parallelSetup();
    files.files.set(ACTIVE_RECORD, JSON.stringify({ code: "demo", pr: false, context: { permissionMode: "bypassPermissions", concurrency: 2 } }));
    const out = parse(await runDevBatches({}, deps));
    strictEqual(runs.length, 0);
    deepStrictEqual(out.next, { crew: "dev-batches", input: { concurrency: 2 } });
    strictEqual(parse(await runDevBatches({ concurrency: 2 }, deps)).next?.crew, "dev-batches");
    strictEqual(runs.length, 2);
  });

  it("goes on in parallel when the plan's run is typed again without --concurrency (a refused hop typed again)", async () => {
    const { files, deps, runs } = parallelSetup();
    files.files.set(ACTIVE_RECORD, JSON.stringify({ code: "demo", pr: false, context: { permissionMode: "bypassPermissions", concurrency: 2 } }));
    const out = parse(await runDevBatches({ code: "demo", permissionMode: "bypassPermissions" }, deps));
    deepStrictEqual(out.next, { crew: "dev-batches", input: { concurrency: 2 } }, out.lines.join("\n"));
    strictEqual(out.lines.at(-1), "→ the run of demo goes on, 2 batches at once");
    strictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!).context.concurrency, 2);
  });

  it("goes back to one at a time on a typed --concurrency 1, the record's concurrency dropped", async () => {
    const { files, deps, runs } = parallelSetup();
    files.files.set(ACTIVE_RECORD, JSON.stringify({ code: "demo", pr: false, context: { permissionMode: "bypassPermissions", concurrency: 2 } }));
    const out = parse(await runDevBatches({ code: "demo", concurrency: 1, permissionMode: "bypassPermissions" }, deps));
    deepStrictEqual(runs, []);
    strictEqual(out.next?.crew, "dev-implement", out.lines.join("\n"));
    strictEqual(JSON.parse(files.files.get(ACTIVE_RECORD)!).context.concurrency, undefined);
  });

  it("refuses to run here, one at a time, a batch a parallel run kept in its worktree, naming how to go on", async () => {
    const { files, deps } = parallelSetup();
    files.listings.set("/workspace/.orkeon/worktrees", ["demo-F2"]);
    const out = parse(await runDevBatches({ code: "demo", permissionMode: "bypassPermissions" }, deps));
    strictEqual(out.next, undefined);
    strictEqual(out.lines.at(-1), "BLOCKED — F2 stays in .orkeon/worktrees/demo-F2, kept by a parallel run: /dev-batches demo --concurrency 2 relaunches it there; " +
      "or remove it (git worktree remove --force .orkeon/worktrees/demo-F2, then git branch -D batches/demo/F2) to run it here");
  });

  it("refuses a parallel run on a host without batch agents", async () => {
    const { deps } = parallelSetup();
    delete deps.runBatch;
    const out = parse(await runDevBatches({ code: "demo", concurrency: 3, permissionMode: "bypassPermissions" }, deps));
    strictEqual(out.lines.at(-1), "BLOCKED — concurrency 3 refused: no batch agents on this host; run with --concurrency 1");
  });

  it("ends the run on a GAPS beside a VALID batch: the VALID one merged, nothing named next", async () => {
    const { files, deps } = parallelSetup();
    deps.runBatch = async (run) => (run.batch === "F2"
      ? { batch: "F2", verdict: "VALID", hash: "1", lines: [], spent: 1 }
      : { batch: "F3", verdict: "GAPS", lines: ["→ Batch F3 GAPS"], spent: 1 });
    const out = parse(await runDevBatches({ code: "demo", concurrency: 2, permissionMode: "bypassPermissions" }, deps));
    strictEqual(out.next, undefined);
    deepStrictEqual(events(files), ["F2 launched", "F3 launched", "F2 returned", "F2 merged", "F3 returned"]);
    ok(out.lines.some((l) => l.includes(".orkeon/worktrees/demo-F3 kept")), out.lines.join("\n"));
  });

  it("probes only the first wave of a typed run, and refuses the run when git fails under the worktree", async () => {
    const { deps, runs } = parallelSetup();
    const probed: string[] = [];
    deps.probe = async (root) => { probed.push(root); return { exitCode: 128, top: "" }; };
    const out = parse(await runDevBatches({ code: "demo", concurrency: 2, permissionMode: "bypassPermissions" }, deps));
    deepStrictEqual(probed, ["/workspace/.orkeon/worktrees/demo-F2"]);
    deepStrictEqual(runs, []);
    ok(out.lines.at(-1)!.includes("Orkeon/orkeon#191"), out.lines.join("\n"));
    const chained = parallelSetup();
    chained.files.files.set(ACTIVE_RECORD, JSON.stringify({ code: "demo", pr: false, context: { permissionMode: "bypassPermissions", concurrency: 2 } }));
    chained.deps.probe = async (root) => { probed.push(root); return { exitCode: 0, top: root }; };
    await runDevBatches({ concurrency: 2 }, chained.deps);
    strictEqual(probed.length, 1);
  });
});
