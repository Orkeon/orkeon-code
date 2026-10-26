// runDevChange over FakeFiles, FakeShell, FakeCodeIndex, FakeLlm and a scripted HumanInput: a bug reproduced by
// running before anything else is written (its output in repro-<code>.txt, its facts in § 2), its questions asked
// and written one at a time; a bug that does not reproduce stops with nothing else written; a command outside the
// pack refused; a perf change measured; a refactor whose pin the index does not show turned unpinned; a feature
// routed to /dev-spec; an issue read by gh; the unattended run BLOCKED.
// Run:  node --test src/crews/dev-change/application/run-dev-change.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { FakePrecedents, PRECEDENTS_SAMPLE } from "../../../support/doubles/fake-precedents.ts";

import { parseDecisions, parseOpenQuestions } from "../../../../src/shared/domain/dev/questions.ts";
import { parsePlanSource } from "../../../../src/shared/domain/dev/spec-format.ts";
import { DEV_CHANGE_NEXT, FEATURE_LINE, knownIn, runDevChange } from "../../../../src/crews/dev-change/application/run-dev-change.ts";
import { REPRO_TIMEOUT_SECONDS, issueCommand } from "../../../../src/crews/dev-change/application/evidence.ts";
import {
  BRIEF, CLEAR, CMD, CODE, ISSUE_42, KNOWN_BY_NAME, KNOWN_INDEX, OTHER_CLASSES, PACK, PARTS_OF_NAMES, PERF_ANSWER, REPRO,
  answer, bug, devChangeSetup, refactor, run,
} from "./run-dev-change.fixtures.ts";
import { assertEndWithPrecedents, assertNoPromptMentions } from "./run-dev-change.assertions.ts";
import { assertAllUnder } from "../../../support/assertions/paths.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("runDevChange — a bug", () => {
  it("runs the reproduction first, writes its output and facts, asks and records the answer, ends on /dev-plan", async () => {
    // Arrange
    const f = devChangeSetup(["Yes"]);
    f.llm.extractions = [answer(), answer({ questions: [] }), CLEAR];

    // Act
    const text = await run(f);

    // Assert
    strictEqual(f.files.writes[0].path, REPRO, "the reproduction's output is written first");
    ok(f.files.files.get(REPRO)?.includes("exit: 1"));
    deepStrictEqual(f.shell.calls.find((c) => c.command === CMD)?.options, { timeoutSeconds: REPRO_TIMEOUT_SECONDS });
    assertAllUnder(f.files.writes.map((w) => w.path), `${CODE}/`);
    const brief = f.files.files.get(BRIEF) ?? "";
    const parsed = parsePlanSource(brief, "change");
    strictEqual(parsed.changeKind, "bug");
    deepStrictEqual(parsed.ids.map((i) => i.id), ["CH-01"]);
    assertMentions(brief, [`- **Reproduction**: \`${CMD}\` — exit 1`, "> The symbol map is read from disk on every call."]);
    deepStrictEqual(parseDecisions(f.asked[0].briefThen), []);
    deepStrictEqual(parseDecisions(brief).map((d) => [d.id, d.answer]), [["Q1", "Yes"]]);
    deepStrictEqual(parseOpenQuestions(brief), []);
    ok(text.includes("warning: 'loads an absent map' is no test the code index shows: its row reads unpinned"), text);
    strictEqual(parsed.mustNotChange[0].pinnedBy, null);
    strictEqual(text.split("\n").at(-1), DEV_CHANGE_NEXT.replace("{code}", "cache"));
  });

  it("stops when the bug does not reproduce: only the output is written, no model call for the brief", async () => {
    // Arrange
    const f = devChangeSetup();
    f.shell.results[CMD] = { exitCode: 0, stdout: "ok 1" };

    // Act
    const text = await run(f);

    // Assert
    ok(text.startsWith("dev-change: the bug did not reproduce"), text);
    deepStrictEqual(f.files.writes.map((w) => w.path), [REPRO]);
    strictEqual(f.llm.extracts.length, 0);
  });

  it("stops on a timeout", async () => {
    // Arrange
    const f = devChangeSetup();
    f.shell.results[CMD] = { timedOut: true, exitCode: -1 };

    // Act
    const text = await run(f);

    // Assert
    ok(text.includes(`ran out of its ${REPRO_TIMEOUT_SECONDS} s`), text);
  });

  it("refuses a command outside the pack before running anything", async () => {
    // Arrange
    const g = devChangeSetup();

    // Act
    const text = await run(g, { ...bug, run: "rm -rf / ; true" });

    // Assert
    ok(text.startsWith('dev-change: --run "rm -rf / ; true" may not run'), text);
    ok(!g.shell.commands.includes("rm -rf / ; true"));
    strictEqual(g.files.writes.length, 0);
  });

  it("refuses a command of the pack the step's rule sets deny, before running it", async () => {
    // Arrange
    const f = devChangeSetup();
    f.files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK.replace("  test: npm test\n", "  test: npm test\n  cli: node bin/cli.js\n"));
    const denied = "node bin/cli.js git add src";

    // Act
    const text = await run(f, { ...bug, run: denied });

    // Assert
    strictEqual(text, `dev-change: the rules of this step deny the shell command '${denied}'; nothing is written`);
    ok(!f.shell.commands.includes(denied));
    strictEqual(f.files.writes.length, 0);
  });

  it("asks the model for the command when --run is absent, and checks it", async () => {
    // Arrange
    const f = devChangeSetup([null]);
    f.llm.extractions = [{ command: "npm test", why: "all" }, { command: CMD, why: "the map test" }, answer(), CLEAR];

    // Act
    const text = await run(f, { ...bug, run: undefined });

    // Assert
    ok(f.llm.extracts[1].prompt.includes("'npm test':"), "the refused command is named on the re-ask");
    ok(f.shell.commands.includes(CMD));
    ok(text.includes("dev-change: BLOCKED — a question went unanswered"), text);
    deepStrictEqual(parseOpenQuestions(f.files.files.get(BRIEF) ?? "").map((q) => q.id), ["Q1"]);
    strictEqual(f.llm.acts.length, 0, "no review on a blocked run");
  });
});

describe("runDevChange — failures", () => {
  it("reports a write of the brief that fails as such", async () => {
    // Arrange
    const f = devChangeSetup(["Yes"]);
    f.deps.llm.extractions = [answer(), CLEAR];
    f.files.write = async () => { throw new Error("disk full"); };

    // Act
    const text = await runDevChange(refactor, f.deps);

    // Assert
    ok(text.startsWith("dev-change: workbench/cache/CHANGE-cache.md could not be written (disk full)"), text);
  });

  it("lets a question that fails go up as it is", async () => {
    // Arrange
    const g = devChangeSetup();
    g.deps.llm.extractions = [answer(), CLEAR];
    g.deps.human.choice = async () => { throw new Error("the question was cancelled"); };

    // Act
    const act = runDevChange(refactor, g.deps);

    // Assert
    await rejects(act, /the question was cancelled/);
  });
});

describe("runDevChange — other kinds and origins", () => {
  it("measures a perf change and needs a number in a criterion", async () => {
    // Arrange
    const f = devChangeSetup([null]);
    f.llm.extractions = [answer(), PERF_ANSWER, CLEAR];
    f.shell.results[CMD] = { exitCode: 0, stdout: "ok 1 - 12 ms" };

    // Act
    const text = await run(f, { ...bug, kind: "perf" });

    // Assert
    ok(f.llm.extracts[1].prompt.includes("a performance change has a criterion with a number"));
    ok((f.files.files.get(BRIEF) ?? "").includes(`- **Measured**: \`${CMD}\``), "the measurement is a fact of § 2");
    ok(text.startsWith("dev-change: workbench/cache/CHANGE-cache.md written — perf"), text);
  });

  it("stops a perf change whose measurement fails", async () => {
    // Arrange
    const g = devChangeSetup();

    // Act
    const text = await run(g, { ...bug, kind: "perf" });

    // Assert
    ok(text.startsWith("dev-change: the measurement failed"), text);
  });

  it("routes a feature to /dev-spec and writes no brief", async () => {
    // Arrange
    const f = devChangeSetup();
    f.llm.extractions = [answer({ route: "feature" })];

    // Act
    const text = await run(f, { code: "cache", kind: "refactor", text: "Add a cache browser screen." });

    // Assert
    strictEqual(text.split("\n").at(-1), FEATURE_LINE.replace("{code}", "cache"));
    strictEqual(f.files.writes.length, 0);
  });

  it("reads an issue by gh", async () => {
    // Arrange
    const f = devChangeSetup([null]);
    f.shell.results[issueCommand("42")] = { stdout: ISSUE_42 };

    // Act
    await run(f, { code: "cache", kind: "refactor", text: "#42" });

    // Assert
    ok((f.files.files.get(BRIEF) ?? "").includes("From issue #42:"));
    ok(f.llm.extracts[0].prompt.includes("Every call rereads."));
  });

  it("stops with the way out when gh fails", async () => {
    // Arrange
    const g = devChangeSetup();
    g.shell.results[issueCommand("42")] = { exitCode: 1, stderr: "not logged in" };

    // Act
    const text = await run(g, { code: "cache", kind: "refactor", text: "#42" });

    // Assert
    ok(text.includes("failed (not logged in)"), text);
  });

  it("refuses a refactor without a protected behaviour", async () => {
    // Arrange
    const f = devChangeSetup([null]);
    f.llm.extractions = [answer({ mustNotChange: [] })];

    // Act
    const text = await run(f, { code: "cache", kind: "refactor", text: "x" });

    // Assert
    ok(text.startsWith("dev-change: the brief was refused twice"), text);
  });

  it("refuses a code holding a spec", async () => {
    // Arrange
    const g = devChangeSetup();
    g.files.listings.set(CODE, ["SPEC-cache.md"]);

    // Act
    const text = await run(g);

    // Assert
    ok(text.startsWith("dev-change: workbench/cache/SPEC-cache.md exists"), text);
  });

  it("refuses --run on a refactor", async () => {
    // Arrange
    const f = devChangeSetup();

    // Act
    const text = await run(f, { ...bug, kind: "refactor" });

    // Assert
    ok(text.startsWith("dev-change: --run is for a bug or a perf change"), text);
  });

  it("T1: recalls decisions and methods from the code, the kind and the origin, the block in the brief's extract, named at the end", async () => {
    // Arrange
    const f = devChangeSetup(["Yes"]);
    f.llm.extractions = [answer(), answer({ questions: [] }), CLEAR];
    const precedents = FakePrecedents.hits();

    // Act
    const text = await runDevChange(bug, { ...f.deps, precedents: precedents.recall });

    // Assert
    deepStrictEqual(precedents.calls.map((c) => c.trigger), ["T1"]);
    ok(precedents.calls[0].query.startsWith("cache — bug — The symbol map is read from disk on every call."), precedents.calls[0].query);
    const briefs = f.llm.extracts.filter((e) => e.prompt.includes("What the code index found for the change"));
    assertEndWithPrecedents(briefs.map((b) => b.prompt), PRECEDENTS_SAMPLE);
    ok(text.includes("precedents recalled: shop-mistake-20261022-n-plus-one"), text);
  });

  it("T1: no block and no line when nothing is recalled", async () => {
    // Arrange
    const f = devChangeSetup(["Yes"]);
    f.llm.extractions = [answer(), answer({ questions: [] }), CLEAR];

    // Act
    const text = await runDevChange(bug, { ...f.deps, precedents: new FakePrecedents().recall });

    // Assert
    assertNoPromptMentions(f.llm.extracts.map((e) => e.prompt), "## Precedents");
    ok(!text.includes("precedents recalled"), text);
  });
});

describe("knownIn", () => {
  for (const c of KNOWN_BY_NAME) {
    it(`knows a test by its name, the last segment of its qualified name, or its file: ${c.test}`, () => {
      // Arrange
      const known = knownIn(KNOWN_INDEX);

      // Act
      const result = known(c.test);

      // Assert
      strictEqual(result, c.known);
    });
  }

  for (const c of PARTS_OF_NAMES) {
    it(`does not take a part of a name for the name: ${c.test} is ${c.known ? "known" : "unknown"}`, () => {
      // Arrange
      const known = knownIn(KNOWN_INDEX);

      // Act
      const result = known(c.test);

      // Assert
      strictEqual(result, c.known);
    });
  }

  it("does not take the extension of a path for a segment", () => {
    // Arrange
    // A path is one name: its extension is not a segment (`ts` would match an entry named so).
    const known = knownIn({ entries: [{ path: "src/x.ts", line: 1, name: "ts" }] });

    // Act
    const result = known("tests/a.test.ts");

    // Assert
    strictEqual(result, false);
  });

  for (const c of OTHER_CLASSES) {
    it(`does not take a last segment another class holds for the name: ${c.test} is ${c.known ? "known" : "unknown"}`, () => {
      // Arrange
      const known = knownIn(KNOWN_INDEX);

      // Act
      const result = known(c.test);

      // Assert
      strictEqual(result, c.known);
    });
  }
});
