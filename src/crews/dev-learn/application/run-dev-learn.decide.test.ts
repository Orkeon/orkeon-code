// runDevLearn's decisions in the run (L-5): after PROPOSALS.md, one multi-select per axis
// with motifs through a FakeHumanInput - answered with a subset, the selected
// motifs accepted and the others refused as --accept / --refuse would; not answered, or
// no human port, nothing decided and the --accept hint kept. Over FakeFiles loaded from
// tests/fixtures/dev/learn, FakeShell, FakeLlm and a fixed clock. Run:
//   node --test src/crews/dev-learn/application/run-dev-learn.decide.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { parseLearnState } from "../../../shared/domain/dev/learn-state.ts";
import { runDevLearn } from "./run-dev-learn.ts";
import {
  ACCEPT_HINT_END, ID_A, ID_B, MEMORY_DIR_REFUSED, OPTIONS, OUT_FILES, REFUSED, STATE, T, asking, decideSetup, pickA,
} from "./run-dev-learn.decide.fixtures.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";

describe("runDevLearn — decisions in the run", () => {
  it("asks one multi-select for the axis, accepts the selected motif and refuses the other", async () => {
    // Arrange
    const q = asking(pickA);
    const f = decideSetup({ human: q });

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(q.asked.length, 1);
    assertMentions(q.asked[0].prompt, [
      "axis Test", "workbench/learn-2026-10-22/PROPOSALS.md", "Decide later, or nothing selected, decides nothing",
    ]);
    deepStrictEqual(q.asked[0].options, OPTIONS);
    const lines = text.split("\n");
    ok(lines.some((l) => l.startsWith(`accepted ${ID_A} — Refusal paths go untested`)), text);
    ok(lines.includes("refused: empty-exports — left out of future proposals (.orkeon/memory/refused.md)"), text);
    ok(lines.some((l) => l.startsWith("axis Test done: ")), text);
    strictEqual(lines.at(-1)?.startsWith("state: .orkeon/dev-learn-state.json — "), true, text);
    strictEqual(lines.filter((l) => l.startsWith("state: ")).length, 1, text);
    ok(!text.includes("--accept"), text);
    deepStrictEqual(f.files.writes.map((w) => w.path), [...OUT_FILES, STATE, REFUSED, STATE]);
    const state = parseLearnState(f.files.files.get(STATE) ?? null);
    ok(state.ok);
    deepStrictEqual(state.state.decisions.map((d) => [d.motif, d.decision, d.date, d.axis]), [
      [ID_A, "accepted", "2026-10-22", "Test"], [ID_B, "refused", "2026-10-22", "Test"],
    ]);
    deepStrictEqual(state.state.treated, [T.exports, T.invoices, T.ledger1, T.ledger1b, T.ledger3].sort());
    ok((f.files.files.get(REFUSED) ?? "").includes("empty-exports | ledger | 2026-10-22 | Exports skip the empty case"),
      f.files.files.get(REFUSED));
  });

  it("writes the refusal to refused.md under memory.dir", async () => {
    // Arrange
    const f = decideSetup({ human: asking(pickA), memoryDir: "docs/memory" });

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    ok(text.includes("refused: empty-exports — left out of future proposals (docs/memory/refused.md)"), text);
    ok(!f.files.files.has(REFUSED), "nothing under the default memory folder");
    ok((f.files.files.get(MEMORY_DIR_REFUSED) ?? "").includes("empty-exports | ledger | 2026-10-22"));
  });

  it("drops, in a later run, the motif refused under memory.dir, naming the same file", async () => {
    // Arrange
    const first = decideSetup({ human: asking(pickA), memoryDir: "docs/memory" });
    await runDevLearn({}, first.deps);
    const again = decideSetup({
      human: asking(() => null), memoryDir: "docs/memory",
      memoryDirRefused: first.files.files.get(MEMORY_DIR_REFUSED) ?? "",
    });

    // Act
    await runDevLearn({}, again.deps);

    // Assert
    const proposals = again.files.files.get(OUT_FILES[0]) ?? "";
    ok(proposals.includes("refused on 2026-10-22 (docs/memory/refused.md)"), proposals);
  });

  it("says a memory.dir set aside, and keeps refused.md in the default memory folder", async () => {
    // Arrange
    const f = decideSetup({ human: asking(pickA), memoryDir: "../outside" });

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    assertMentions(text, ["memory.dir '../outside' set aside", "left out of future proposals (.orkeon/memory/refused.md)"]);
  });

  it("decides nothing when the person does not answer: only the proposals written, the --accept hint kept", async () => {
    // Arrange
    const q = asking(() => null);
    const f = decideSetup({ human: q });

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(q.asked.length, 1);
    deepStrictEqual(f.files.writes.map((w) => w.path), OUT_FILES);
    ok(text.endsWith(ACCEPT_HINT_END), text);
  });

  it("decides nothing on an empty selection, as the prompt says", async () => {
    // Arrange
    const q = asking(() => []);
    const f = decideSetup({ human: q });

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    deepStrictEqual(f.files.writes.map((w) => w.path), OUT_FILES);
    ok(text.includes(`→ /dev-learn --accept ${ID_A},${ID_B}`), text);
  });

  it("decides nothing without a human port, as before", async () => {
    // Arrange
    const f = decideSetup();

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    deepStrictEqual(f.files.writes.map((w) => w.path), OUT_FILES);
    ok(text.includes(`→ /dev-learn --accept ${ID_A},${ID_B}`), text);
  });

  it("asks nothing with --list", async () => {
    // Arrange
    const q = asking(() => { throw new Error("not asked"); });
    const f = decideSetup({ human: q });

    // Act
    await runDevLearn({ list: true }, f.deps);

    // Assert
    strictEqual(q.asked.length, 0);
  });

  it("asks nothing when no motif is kept", async () => {
    // Arrange
    const q = asking(() => { throw new Error("not asked"); });
    const f = decideSetup({ human: q, noMotif: true });

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(q.asked.length, 0);
    ok(text.endsWith("→ nothing to decide: the axes return once new gaps arrive"), text);
  });
});
