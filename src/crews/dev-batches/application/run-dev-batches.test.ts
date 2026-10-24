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
} from "../../../shared/domain/git/close.ts";
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
      githubTool: true, steps: 2,
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

  it("refuses a read-only session mode, and a code that is not a folder name", async () => {
    const { deps } = setup();
    ok(parse(await runDevBatches({ code: "demo", permissionMode: "plan" }, deps)).lines.at(-1)!.startsWith("BLOCKED — the session mode plan"));
    ok(parse(await runDevBatches({ code: "../x" }, deps)).lines[0].startsWith("BLOCKED — '../x' is not a work code"));
  });

  it("killed during a batch and run again, relaunches the first batch not done, without a second review", async () => {
    const { files, deps } = setup();
    const llm = new FakeLlm();
    llm.extractions = [{ verdict: "CLEAR", rows: [] }];
    await runDevBatches({ code: "demo" }, { ...deps, reviewer: llm });
    strictEqual(llm.acts.length, 1);
    const again = parse(await runDevBatches({ code: "demo" }, { ...deps, reviewer: llm }));
    strictEqual(again.next?.input.batch, "F2");
    ok(again.lines.some((l) => l.startsWith("→ F2 relaunched")), again.lines.join("\n"));
    strictEqual(llm.acts.length, 1);
    deepStrictEqual(events(files), ["F2 launched", "F2 relaunched"]);
  });
});

describe("runDevBatches — back from a batch", () => {
  it("runs a three-batch plan to one push and one pull request", async () => {
    const { files, shell, deps } = setup();
    await runDevBatches({ code: "demo" }, deps);
    markDone(files, "F2");
    const second = parse(await runDevBatches({ after: ["→ F2 committed"] }, deps));
    strictEqual(second.next?.input.batch, "F3");
    ok(second.lines.includes("✓ F2 done and committed"));
    markDone(files, "F3");
    const last = parse(await runDevBatches({ after: ["→ F3 committed"] }, deps));
    strictEqual(last.next, undefined);
    deepStrictEqual(events(files), ["F2 launched", "F2 returned", "F2 merged", "F3 launched", "F3 returned", "F3 merged", "closed"]);
    strictEqual(shell.commands.filter((c) => c === gitPushCommand("feat/demo")).length, 1);
    ok(last.lines.includes("✓ pushed feat/demo to origin"), last.lines.join("\n"));
    ok(files.writes.some((w) => w.path.endsWith("/PR.md")), "the pull request's body is written");
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

  it("does not launch a batch whose review raises a Blocking question", async () => {
    const { files, deps } = setup();
    const llm = new FakeLlm();
    llm.extractions = [{ verdict: "GAPS", rows: [{ severity: "Blocking", question: "Does F2 still read the parsers F1 gave?", evidence: "DEMO-PLAN-F2.md:6", target: "F2" }] }];
    const out = parse(await runDevBatches({ code: "demo" }, { ...deps, reviewer: llm }));
    strictEqual(out.next, undefined);
    ok(out.lines.includes("review of F2: GAPS — 1 Blocking, 0 Major"), out.lines.join("\n"));
    deepStrictEqual(events(files), ["F2 stopped"]);
    // Settled and typed again: launched without a second review.
    strictEqual(parse(await runDevBatches({ code: "demo" }, { ...deps, reviewer: llm })).next?.input.batch, "F2");
    strictEqual(llm.acts.length, 1);
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

describe("batchesBranchName", () => {
  it("takes the pattern's first prefix", () => {
    strictEqual(batchesBranchName("feat|fix/<slug>", "demo"), "feat/demo");
    strictEqual(batchesBranchName("<slug>", "demo"), null);
  });
});
