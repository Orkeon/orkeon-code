// runDevLearn's decisions in the run (L-5): after PROPOSALS.md, one multi-select per axis
// with motifs through an inline HumanInput stub - answered with a subset, the selected
// motifs accepted and the others refused as --accept / --refuse would; not answered, or
// no human port, nothing decided and the --accept hint kept. Over FakeFiles loaded from
// tests/fixtures/dev/learn, FakeShell, FakeLlm and a fixed clock. Run:
//   node --test src/crews/dev-learn/application/run-dev-learn-decide.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { HumanInput } from "../../../shared/application/ports.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import { motifId } from "../../../shared/domain/dev/learn-proposals.ts";
import { parseLearnState } from "../../../shared/domain/dev/learn-state.ts";
import { runDevLearn } from "./run-dev-learn.ts";

const root = fileURLToPath(new URL("../../../../tests/fixtures/dev/learn/", import.meta.url));
const W = "/workspace/workbench";
const OUT = `${W}/learn-2026-10-22`;
const STATE = "/workspace/.orkeon/dev-learn-state.json";
const REFUSED = "/workspace/.orkeon/memory/refused.md";
const T = { exports: "7b3b561c93", invoices: "3a59a45e69", ledger1: "c936075d95", ledger1b: "2bfca0aab4", ledger3: "b983faad38" };
const ROWS_A = [T.ledger1, T.ledger3, T.invoices];
const ROWS_B = [T.exports, T.invoices, T.ledger3];
const ID_A = motifId("Test", ROWS_A);
const ID_B = motifId("Test", ROWS_B);

interface Asked { prompt: string; options: readonly string[] }
type MultiAnswer = { answered: true; values: string[] } | { answered: false };

function stub(pick: (options: readonly string[]) => MultiAnswer): { human: Pick<HumanInput, "multi">; asked: Asked[] } {
  const asked: Asked[] = [];
  return {
    asked,
    human: { multi: async (prompt, options) => { asked.push({ prompt, options }); return pick(options); } },
  };
}

function setup(human?: Pick<HumanInput, "multi">) {
  const files = new FakeFiles();
  const work = join(root, "workbench");
  const codes = readdirSync(work);
  files.listings.set("/workspace", ["workbench/", "CONTRIBUTING.md", "tests/", ".orkeon/"]);
  files.listings.set(W, codes.map((c) => `${c}/`));
  for (const code of codes) {
    if (!statSync(join(work, code)).isDirectory()) continue;
    const names = readdirSync(join(work, code));
    files.listings.set(`${W}/${code}`, names);
    for (const name of names) files.files.set(`${W}/${code}/${name}`, readFileSync(join(work, code, name), "utf8"));
  }
  files.files.set("/workspace/.claude/local/dev-learn-state.json", readFileSync(join(root, "harness-state.json"), "utf8"));
  files.files.set("/workspace/CONTRIBUTING.md", "# Contributing\n\nA refusal is part of a command's contract.\nKeep it short.\n");
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { stdout: ".orkeon/config.json\nworkbench/\n" };
  shell.results["git remote get-url origin"] = { stdout: "git@github.com:acme/ledger.git\n" };
  const llm = new FakeLlm();
  const motif = (over: Record<string, unknown>) => ({
    title: "Refusal paths go untested", topic: "refusal-tests", rows: ROWS_A,
    preventive_line: "Each refusal text of a command has a test that triggers it.",
    owner_kind: "repository", owner_path: "CONTRIBUTING.md", check: "test", status: "new",
    lines_added: ["Every refusal a command prints has a test that makes it print."],
    novelty: "the guide names no refusal test", key_term: "refusal", ...over,
  });
  llm.extractions = [{
    motifs: [motif({}), motif({ title: "Exports skip the empty case", topic: "empty-exports", rows: ROWS_B, key_term: "empty" })],
  }];
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const deps = { files, shell, llm, config, log: new FakeLogger(), clock: () => new Date(2026, 9, 22, 14, 5), human };
  return { files, deps };
}

const OUT_FILES = [`${OUT}/proposals.json`, `${OUT}/PROPOSALS.md`];

describe("runDevLearn — decisions in the run", () => {
  it("asks one multi-select for the axis, accepts the selected motif and refuses the other", async () => {
    const q = stub((options) => ({ answered: true, values: options.filter((o) => o.startsWith(ID_A)) }));
    const f = setup(q.human);
    const text = await runDevLearn({}, f.deps);
    strictEqual(q.asked.length, 1);
    ok(q.asked[0].prompt.includes("axis Test") && q.asked[0].prompt.includes("workbench/learn-2026-10-22/PROPOSALS.md"), q.asked[0].prompt);
    deepStrictEqual(q.asked[0].options, [
      `${ID_A} — Refusal paths go untested (3 batches, new, CONTRIBUTING.md)`,
      `${ID_B} — Exports skip the empty case (3 batches, new, CONTRIBUTING.md)`,
    ]);
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

  it("decides nothing when the person does not answer: only the proposals written, the --accept hint kept", async () => {
    const q = stub(() => ({ answered: false }));
    const f = setup(q.human);
    const text = await runDevLearn({}, f.deps);
    strictEqual(q.asked.length, 1);
    deepStrictEqual(f.files.writes.map((w) => w.path), OUT_FILES);
    ok(text.endsWith(`→ /dev-learn --accept ${ID_A},${ID_B}\n` +
      "  or /dev-learn --refuse <id> for each one you reject — read the lines first in PROPOSALS.md"), text);
  });

  it("decides nothing without a human port, as before", async () => {
    const f = setup();
    const text = await runDevLearn({}, f.deps);
    deepStrictEqual(f.files.writes.map((w) => w.path), OUT_FILES);
    ok(text.includes(`→ /dev-learn --accept ${ID_A},${ID_B}`), text);
  });

  it("asks nothing with --list, or when no motif is kept", async () => {
    const q = stub(() => { throw new Error("not asked"); });
    const f = setup(q.human);
    await runDevLearn({ list: true }, f.deps);
    const g = setup(q.human);
    (g.deps.llm as FakeLlm).extractions = [{ motifs: [] }];
    const text = await runDevLearn({}, g.deps);
    strictEqual(q.asked.length, 0);
    ok(text.endsWith("→ nothing to decide: the axes return once new gaps arrive"), text);
  });
});
