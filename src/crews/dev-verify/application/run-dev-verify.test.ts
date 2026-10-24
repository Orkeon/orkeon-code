// runDevVerify over FakeFiles, FakeShell, FakeLlm and a config store on FakeFiles: a
// demo plan folder whose gate is green, then each outcome of the command - red gate,
// --gate-only, VALID, GAPS, BLOCKED, resume, the refusals, full. Run:
//   node --test src/crews/dev-verify/application/run-dev-verify.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import { GIT_DIFF_CHECK, excludePathspecs, gitMethodGrep } from "../domain/commands.ts";
import type { CostIndex } from "../../../shared/application/ports.ts";
import { COST_NOT_WIRED, costSummary } from "../../../shared/domain/dev/access-cost.ts";
import { runDevVerify } from "./run-dev-verify.ts";
import type { DevVerifyInputs } from "./run-dev-verify.ts";
import { scriptToolSlot } from "../../../shared/application/dev/script-tool-slot.ts";
import type { ValidationRunner } from "./audit.ts";
import { FakePrecedents, PRECEDENTS_SAMPLE } from "../../../../tests/doubles/fake-precedents.ts";

const DIR = "/workspace/workbench/demo";
const VERDICT = `${DIR}/DEMO-VERIFY-F2.md`;
const EX = "':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'";
const UNTRACKED = `git ls-files --others --exclude-standard -- . ${EX}`;
const TRAIT_GREP = `git grep --untracked -I -noE -e '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]' -- src tests ${EX}`;
const PACK = "layout:\n  domain: src\n  tests: tests\n  build_outputs: [bin, obj]\ncommands:\n  test: npm test\n" +
  "  test_class: node --test <file>\ntests:\n  rule_trait: BR\ncontrib:\n  commit: conventional commits\n";
const SHEET = "# DEMO-PLAN-F2 — Command\n| Applied rules | DDD-01 |\n## TDD sequence\n| # | Test |\n|---|---|\n" +
  "| 1 | `ShowsTheState` BR-01 |\nTDD: RED [x] GREEN [x] COST [x]\n";
const PLAN = "# DEMO-PLAN\nNon-applicable rules: DDD-02 DDD-03 DDD-04 DDD-05 DDD-06 DDD-07 DDD-08 DDD-09 DDD-10 DDD-11 " +
  "APP-01 APP-02 APP-03 APP-04 APP-05 PERF-01\n";
const GREEN_LINE = "GATE — batch F2: GREEN";
const COST_LINE = costSummary(COST_NOT_WIRED);

function setup() {
  const files = new FakeFiles();
  files.files.set("/workspace/.orkeon/repo.yaml", PACK);
  files.files.set(`${DIR}/DEMO-PLAN-F2.md`, SHEET);
  files.files.set(`${DIR}/DEMO-PLAN.md`, PLAN);
  files.files.set("/workspace/tests/a.test.ts", "describe(\"ShowsTheState\", () => {});\n");
  files.listings.set("/workspace", ["workbench", "src", "tests"]);
  files.listings.set("/workspace/workbench", ["demo"]);
  files.listings.set(DIR, ["DEMO-PLAN-F2.md", "DEMO-PLAN.md"]);
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
  shell.results["git diff --name-only HEAD"] = { stdout: "src/a.ts\nworkbench/demo/DEMO-PLAN-F2.md\n" };
  shell.results[UNTRACKED] = { stdout: "tests/a.test.ts\n" };
  shell.results[TRAIT_GREP] = { stdout: 'tests/a.test.ts:3:[Trait("BR", "BR-01")]\n' };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { stdout: ".orkeon/config.json\nworkbench/\n" };
  shell.results[gitMethodGrep(["ShowsTheState"], ["tests"], excludePathspecs(["bin", "obj"])) ?? ""] =
    { stdout: "tests/a.test.ts:1:ShowsTheState\n" };
  const llm = new FakeLlm();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const deps = { files, shell, llm, config, log: new FakeLogger(), clock: () => new Date(2026, 9, 22, 14, 5) };
  return { files, shell, llm, deps };
}

const run = (deps: ReturnType<typeof setup>["deps"], input: DevVerifyInputs) => runDevVerify(input, deps);

const MINOR = { severity: "Minor", axis: "Simplification", gap: "a loop could be a map", evidence: "src/a.ts:4", fix: "use map" };
const MAJOR = { severity: "Major", axis: "Reuse", gap: "parses dates by hand", evidence: "src/a.ts:9", fix: "call the parser" };
const answer = (rows: unknown[], validations: string[] = []) => ({ verdict: rows.length ? "GAPS" : "VALID", rows, validations });
const TARGET = "batch F2 — sheet workbench/demo/DEMO-PLAN-F2.md — mode fast — work folder workbench/ (default)";

describe("runDevVerify — the gate", () => {
  it("returns the gate lines and calls no model when the gate is red", async () => {
    const f = setup();
    f.shell.results[GIT_DIFF_CHECK] = { exitCode: 2 };
    const text = await run(f.deps, { batch: "F2" });
    ok(text.endsWith("GATE — batch F2: RED — fix and run again, no audit before"), text);
    ok(text.startsWith(`${TARGET}\n`), text);
    strictEqual(f.llm.acts.length, 0);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });

  it("stops after a green gate under --gate-only: no model call, no write", async () => {
    const f = setup();
    const text = await run(f.deps, { batch: "F2", plan: "demo", gateOnly: true });
    const lines = text.split("\n");
    strictEqual(lines.at(-1), "dev-verify: --gate-only: the gate alone, no capture and no audit");
    strictEqual(lines.at(-2), GREEN_LINE);
    strictEqual(f.llm.acts.length + f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });
});

describe("runDevVerify — the verdict", () => {
  it("writes a VALID verdict and returns the lines of the outcome", async () => {
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([MINOR])];
    const text = await run(f.deps, { batch: "F2" });
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.startsWith("# DEMO-VERIFY-F2 — 2026-10-22 14:05 — fast\n\n## Verdict — VALID\n"), written);
    deepStrictEqual(text.split("\n"), [
      TARGET,
      GREEN_LINE,
      COST_LINE,
      ...written.trimEnd().split("\n"),
      "written: workbench/demo/DEMO-VERIFY-F2.md — capture: workbench/demo/capture-F2/",
      "→ Batch F2 VALID. The close commits the batch's files: /dev-implement F2 <code> --close " +
        "(run by itself when /dev-implement launched this audit).",
      "  files: src/a.ts, tests/a.test.ts",
    ]);
    strictEqual(f.llm.acts.length, 1);
  });

  it("binds the run_validation tool's slot for the audit, cites the run the auditor made through it, then releases it", async () => {
    const f = setup();
    const slot = scriptToolSlot<ValidationRunner>();
    const command = "node --test tests/a.test.ts";
    f.shell.results[command] = { exitCode: 0, stdout: "# pass 3\n# fail 0\n" };
    const results: unknown[] = [];
    const act = f.llm.act.bind(f.llm);
    f.llm.act = async (prompt, request) => {
      const bound = slot.get(); // what run_validation's body calls
      results.push(bound === undefined ? "unbound" : (await bound.run(command)).report);
      return act(prompt, request);
    };
    f.llm.answers = ["the test ran green"];
    f.llm.extractions = [answer([MINOR])];
    await runDevVerify({ batch: "F2" }, { ...f.deps, validationSlot: slot });
    deepStrictEqual(results, [{ command, outcome: "exit 0", tail: "# pass 3\n# fail 0" }]);
    strictEqual(f.llm.acts.length, 1);
    strictEqual(f.shell.commands.filter((c) => c === command).length, 1);
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.includes(`\`${command}\` — exit 0`), written);
    strictEqual(slot.get(), undefined);
  });

  it("prints the Cost line the code index measures, and writes it in the capture", async () => {
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    const asked: string[] = [];
    const costIndex: CostIndex = {
      roots: async () => ["/workspace"],
      refresh: async (_root, files) => { asked.push(...files); return []; },
      accessCost: async () => ({
        report: {
          members: [{
            member: "/workspace/src/a.ts::show",
            portCalls: [{ receiver: "this.store", method: "load", line: 2, inLoop: false, inLambda: false }],
            memoryFilters: [], cost: { reads: 1, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 },
          }],
          cost: { reads: 1, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 },
        },
        errors: [],
      }),
    };
    const lines = (await runDevVerify({ batch: "F2" }, { ...f.deps, costIndex })).split("\n");
    const measured = "Cost: 1 read + 0 writes through ports outside loops; in a loop, a lambda or a memory filter: none";
    deepStrictEqual(lines.slice(1, 3), [GREEN_LINE, measured]);
    deepStrictEqual(asked, ["/workspace/src/a.ts"]);
    strictEqual(f.files.files.get(`${DIR}/capture-F2/cost.txt`),
      `exit: 0\n[src/a.ts::show]\nPorts outside loops (1): this.store.load L2\n${measured}\n`);
    ok((f.files.files.get(`${DIR}/capture-F2/table.md`) ?? "").includes(`| Cost | capture \`cost\` | ok | \`exit: 0\` — ${measured} |`));
  });

  it("points a GAPS verdict at the correction of its first row", async () => {
    const f = setup();
    f.llm.answers = ["gaps"];
    f.llm.extractions = [answer([MINOR, MAJOR])];
    const lines = (await run(f.deps, { batch: "F2" })).split("\n");
    ok(lines.includes("## Verdict — GAPS"));
    deepStrictEqual(lines.slice(-2), [
      "→ /dev-implement F2 — correction: Major Reuse: parses dates by hand",
      "  it appends the gap to the sheet as a new step and runs it; the audit follows by itself (/dev-verify F2 resume)",
    ]);
  });

  it("T4: recalls mistakes from the sheet's title and the changed code paths, the block in the auditor's brief", async () => {
    const f = setup();
    f.llm.answers = ["gaps"];
    f.llm.extractions = [answer([MAJOR])];
    const precedents = FakePrecedents.hits();
    const text = await runDevVerify({ batch: "F2" }, { ...f.deps, precedents: precedents.recall });
    deepStrictEqual(precedents.calls, [{ trigger: "T4", query: "DEMO-PLAN-F2 — Command — src/a.ts — tests/a.test.ts" }]);
    const brief = f.llm.acts[0].prompt;
    ok(brief.includes(PRECEDENTS_SAMPLE), brief);
    ok(brief.indexOf(PRECEDENTS_SAMPLE) < brief.indexOf("The mechanical table (table.md):"));
    ok(text.split("\n").includes("precedents recalled: shop-mistake-20261022-n-plus-one"), text);
  });

  it("T4: no block and no line when nothing is recalled", async () => {
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([MINOR])];
    const text = await runDevVerify({ batch: "F2" }, { ...f.deps, precedents: new FakePrecedents().recall });
    ok(!f.llm.acts[0].prompt.includes("## Precedents"));
    ok(!text.includes("precedents recalled"), text);
  });

  it("M-7: after a GAPS verdict written, the harvest's lines close the message; a VALID one harvests nothing", async () => {
    const f = setup();
    f.llm.answers = ["gaps"];
    f.llm.extractions = [answer([MAJOR])];
    const seen: Array<{ folder: string; verdict: boolean }> = [];
    const harvest = async (work: { folder: string; vfsPath: string | null }) => {
      seen.push({ folder: work.folder, verdict: f.files.files.has(VERDICT) });
      return ["shared memory: 1 mistake candidate harvested from the audits (x) → /memory-admit decides each one."];
    };
    const lines = (await runDevVerify({ batch: "F2" }, { ...f.deps, harvest })).split("\n");
    deepStrictEqual(seen, [{ folder: "workbench", verdict: true }]);
    strictEqual(lines[lines.length - 1], "shared memory: 1 mistake candidate harvested from the audits (x) → /memory-admit decides each one.");
    const v = setup();
    v.llm.answers = ["fine"];
    v.llm.extractions = [answer([MINOR])];
    let called = 0;
    await runDevVerify({ batch: "F2" }, { ...v.deps, harvest: async () => { called++; return ["x"]; } });
    strictEqual(called, 0);
  });

  it("warns when the auditor's verdict differs from the one its rows make, and keeps the rows' verdict", async () => {
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [{ ...answer([MAJOR]), verdict: "VALID" }];
    const lines = (await run(f.deps, { batch: "F2" })).split("\n");
    ok(lines.includes("## Verdict — GAPS"));
    ok(f.deps.log.lines.includes("warn: the auditor said VALID; the rows make it GAPS"), f.deps.log.lines.join("\n"));
    const agreed = setup();
    agreed.llm.answers = ["gaps"];
    agreed.llm.extractions = [answer([MAJOR])];
    await run(agreed.deps, { batch: "F2" });
    ok(!agreed.deps.log.lines.some((l) => l.startsWith("warn: the auditor said")), agreed.deps.log.lines.join("\n"));
  });

  it("is BLOCKED, writing no verdict, when the answer does not parse after one re-ask", async () => {
    const f = setup();
    f.llm.answers = ["rambling"];
    f.llm.extractions = [{ verdict: "PERHAPS" }];
    const lines = (await run(f.deps, { batch: "F2" })).split("\n");
    deepStrictEqual(lines.slice(-3), [
      GREEN_LINE,
      COST_LINE,
      "dev-verify: BLOCKED — the auditor's answer did not parse after one re-ask (verdict must be VALID or GAPS): " +
        "its replies are in workbench/demo/capture-F2/auditor-replies.txt; no verdict written",
    ]);
    strictEqual(f.files.files.has(VERDICT), false);
    ok(f.files.files.has(`${DIR}/capture-F2/auditor-replies.txt`));
  });

  it("is BLOCKED when the verdict cannot be written", async () => {
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    const write = f.files.write.bind(f.files);
    f.files.write = async (path, content) => {
      if (path === VERDICT) throw new Error("read-only mount\nmore");
      await write(path, content);
    };
    const text = await run(f.deps, { batch: "F2" });
    ok(text.endsWith("dev-verify: BLOCKED — workbench/demo/DEMO-VERIFY-F2.md cannot be written (read-only mount)"), text);
  });
});

describe("runDevVerify — resume", () => {
  const EARLIER = "# DEMO-VERIFY-F2 — 2026-10-21 09:40 — fast\n\n## Verdict — GAPS\n\n" +
    "| Severity | Axis | Gap | Evidence | Expected fix |\n|----------|------|-----|----------|--------------|\n" +
    "| Major | reuse | parses dates by hand | src/a.ts:9 | call the parser |\n\nValidations: none — the capture's build and last test run stand\n";

  it("hands the previous gaps to the auditor and appends a dated section", async () => {
    const f = setup();
    f.files.files.set(VERDICT, EARLIER);
    f.llm.answers = ["fixed now"];
    f.llm.extractions = [answer([])];
    await run(f.deps, { batch: "F2", mode: "resume" });
    ok(f.llm.acts[0].prompt.includes("- Major · Reuse · parses dates by hand · evidence: src/a.ts:9 · fix: call the parser"),
      f.llm.acts[0].prompt);
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.startsWith(EARLIER.trimEnd()), written);
    ok(written.includes("\n\n# DEMO-VERIFY-F2 — 2026-10-22 14:05 — resume\n\n## Verdict — VALID\n"), written);
  });

  it("runs resume --gate-only without an earlier verdict", async () => {
    const f = setup();
    const text = await run(f.deps, { batch: "F2", mode: "resume", gateOnly: true });
    strictEqual(text.split("\n").at(-1), "dev-verify: --gate-only: the gate alone, no capture and no audit");
    deepStrictEqual(f.files.writes, []);
  });

  it("refuses resume without an earlier verdict", async () => {
    const f = setup();
    const text = await run(f.deps, { batch: "F2", mode: "resume" });
    strictEqual(text.split("\n").at(-1), "dev-verify: resume needs workbench/demo/DEMO-VERIFY-F2.md: run /dev-verify F2 first");
    strictEqual(f.llm.acts.length, 0);
  });
});

describe("runDevVerify — refusals", () => {
  it("refuses a work tree whose top is not /workspace, and outside a work tree", async () => {
    const f = setup();
    f.shell.results[GIT_TOPLEVEL] = { stdout: "/workspace/sub\n" };
    strictEqual(await run(f.deps, { batch: "F2" }),
      "dev-verify: the git work tree is /workspace/sub, not /workspace: run Orkeon Code at the top of the repository");
    f.shell.results[GIT_TOPLEVEL] = { exitCode: 128, stdout: "" };
    strictEqual(await run(f.deps, { batch: "F2" }), "dev-verify: not inside a git work tree");
  });

  it("refuses several sheets for one batch, and no sheet at all", async () => {
    const f = setup();
    f.files.listings.set("/workspace/workbench", ["demo", "other"]);
    f.files.listings.set("/workspace/workbench/other", ["OTHER-PLAN-F2.md"]);
    strictEqual(await run(f.deps, { batch: "F2" }),
      "dev-verify: several sheets for F2: workbench/demo/DEMO-PLAN-F2.md, workbench/other/OTHER-PLAN-F2.md: " +
        "name the plan, e.g. /dev-verify F2 <code>");
    strictEqual(await run(f.deps, { batch: "F9" }), "dev-verify: no workbench/*/*-PLAN-F9.md: name the plan, e.g. /dev-verify F9 <code>");
    strictEqual(await run(f.deps, { batch: "F9", plan: "demo" }), "dev-verify: workbench/demo/ holds no *-PLAN-F9.md");
  });

  it("resolves a plan path and refuses one without its sheet", async () => {
    const f = setup();
    const text = await run(f.deps, { batch: "F2", plan: "/workspace/workbench/demo/DEMO-PLAN.md", gateOnly: true });
    ok(text.endsWith("dev-verify: --gate-only: the gate alone, no capture and no audit"), text);
    strictEqual(await run(f.deps, { batch: "F3", plan: "workbench/demo/DEMO-PLAN.md" }),
      "dev-verify: no workbench/demo/DEMO-PLAN-F3.md beside workbench/demo/DEMO-PLAN.md");
    strictEqual(await run(f.deps, { batch: "F2", plan: "../demo/DEMO-PLAN.md" }),
      "dev-verify: '../demo/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path");
  });

  it("refuses inputs that are not a batch", async () => {
    const f = setup();
    strictEqual(await run(f.deps, { batch: "2" }), "dev-verify: the input batch must be F<n>, e.g. F2");
    strictEqual(await run(f.deps, { batch: "F2", mode: "slow" }), "dev-verify: the input mode must be fast, full or resume");
  });
});

describe("runDevVerify — full", () => {
  it("runs commands.test with 900 s first, and a red suite is a Blocking Test row", async () => {
    const f = setup();
    f.shell.results["npm test"] = { exitCode: 1, stdout: "ℹ pass 40\nℹ fail 2\n" };
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    const text = await run(f.deps, { batch: "F2", mode: "full" });
    deepStrictEqual(f.shell.calls.find((c) => c.command === "npm test"),
      { command: "npm test", options: { timeoutSeconds: 900 } });
    ok(f.llm.acts[0].prompt.includes("- command: npm test"), f.llm.acts[0].prompt);
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.includes("## Verdict — GAPS"), written);
    ok(written.includes("| Blocking | Test | the whole fast suite is red: exit 1, 2 failed |"), written);
    ok(written.includes("Validations: whole fast suite — exit 1\n"), written);
    ok(text.includes("→ /dev-implement F2 — correction: Blocking Test: the whole fast suite is red: exit 1, 2 failed"), text);
  });

  it("adds a Major Test row when the whole suite times out", async () => {
    const f = setup();
    f.shell.results["npm test"] = { timedOut: true, exitCode: -1 };
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    await run(f.deps, { batch: "F2", mode: "full" });
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.includes("## Verdict — GAPS"), written);
    ok(written.includes("| Major | Test | the whole fast suite did not finish within 900 s |"), written);
    ok(written.includes("Not run: `npm test` — timed out after 900 s"), written);
  });

  it("words a missing exit code as none reported, never exit -1", async () => {
    const f = setup();
    f.shell.results["npm test"] = { exitCode: -1, stdout: "" };
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    await run(f.deps, { batch: "F2", mode: "full" });
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.includes("| Blocking | Test | the whole fast suite is red: no exit code reported |"), written);
    ok(written.includes("Validations: whole fast suite — no exit code reported\n"), written);
    ok(!written.includes("exit -1"), written);
  });

  it("says Not run when the pack has no commands.test", async () => {
    const f = setup();
    f.files.files.set("/workspace/.orkeon/repo.yaml", PACK.replace("  test: npm test\n", ""));
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    await run(f.deps, { batch: "F2", mode: "full" });
    ok((f.files.files.get(VERDICT) ?? "").includes("Not run: commands.test — the pack has none"));
  });
});
