// The repository runDevLearn is tested on: FakeFiles loaded from tests/fixtures/dev/learn, FakeShell, FakeLlm and a
// fixed clock, the untreated rows of the Test axis, the motifs the model answers and the head line of each run.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { GIT_TOPLEVEL } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../../src/shared/application/dev/load-dev-context.ts";
import type { ProposalsFile } from "../../../../src/shared/domain/dev/learn-proposals.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

const root = fileURLToPath(new URL("../../../fixtures/dev/learn/", import.meta.url));

/** A file the harness's script recorded under tests/fixtures/dev/learn. */
export const recorded = (name: string): string => readFileSync(join(root, name), "utf8");

export const W = `${WORKSPACE}/workbench`;
export const OUT = `${W}/learn-2026-10-22`;
export const HARNESS_STATE = `${WORKSPACE}/.claude/local/dev-learn-state.json`;
export const ORKEON_STATE = `${WORKSPACE}/.orkeon/dev-learn-state.json`;
export const REFUSED = `${WORKSPACE}/.orkeon/memory/refused.md`;
/** The Test axis's untreated rows, by batch. */
export const T = { exports: "7b3b561c93", invoices: "3a59a45e69", ledger1: "c936075d95", ledger1b: "2bfca0aab4", ledger3: "b983faad38" };
export const THREE = [T.ledger1, T.ledger3, T.invoices];
export const HEAD = "dev-learn — work folder workbench/ (default) — 13 untreated gaps across 7 batches in 7 verdict files " +
  "(treated: 0 by Orkeon Code, 1 by the harness; refused motifs: 2)";

/** The fixture's repository at /workspace, the harness state recorded, CONTRIBUTING.md its one owner file. */
export function setup() {
  const files = new FakeFiles();
  const work = join(root, "workbench");
  const codes = readdirSync(work);
  files.listings.set(WORKSPACE, ["workbench/", "CONTRIBUTING.md", "tests/", ".orkeon/"]);
  files.listings.set(W, codes.map((c) => `${c}/`));
  for (const code of codes) {
    if (!statSync(join(work, code)).isDirectory()) continue;
    const names = readdirSync(join(work, code));
    files.listings.set(`${W}/${code}`, names);
    for (const name of names) files.files.set(`${W}/${code}/${name}`, readFileSync(join(work, code, name), "utf8"));
  }
  files.files.set(HARNESS_STATE, recorded("harness-state.json"));
  files.files.set(`${WORKSPACE}/CONTRIBUTING.md`, "# Contributing\n\nA refusal is part of a command's contract.\nKeep it short.\n");
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { stdout: ".orkeon/config.json\nworkbench/\n" };
  const llm = new FakeLlm();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const deps = { files, shell, llm, config, log: new FakeLogger(), clock: () => new Date(2026, 9, 22, 14, 5) };
  return { files, shell, llm, deps };
}

/** A motif of the Test axis as the model answers it: refusal tests over THREE, owned by CONTRIBUTING.md. */
export const motif = (over: Record<string, unknown> = {}) => ({
  title: "Refusal paths go untested", topic: "refusal-tests", rows: THREE,
  preventive_line: "Each refusal text of a command has a test that triggers it.",
  owner_kind: "repository", owner_path: "CONTRIBUTING.md", check: "test", status: "new",
  lines_added: ["Every refusal a command prints has a test that makes it print."],
  novelty: "the guide names no refusal test", key_term: "refusal", ...over,
});

/** The --list of one axis the harness's script printed for it, under the head line. */
export const AXIS_TEST_LIST = `${HEAD}\n${recorded("axis-Test.py.txt").trimEnd()}`;

/** The backlog --list prints: the counts per axis, then the refused motifs. */
export const BACKLOG_LIST: readonly string[] = [
  HEAD,
  "",
  "axis             gaps batches blocking",
  "Test                5       4        1",
  "Reuse               2       2        0",
  "Scope               1       1        0",
  "Conventions         1       1        0",
  "Placement           3       1        1",
  "Plan                1       1        0",
  "",
  "refused motifs:",
  "- Rounding inside handlers (harness)",
  "- keep: Each command returns a CommandView. (harness)",
];

/** The fixture with an extraction keeping the first motif and dropping one. */
export function oneMotifProposed() {
  const f = setup();
  f.llm.extractions = [{ motifs: [motif()], dropped: [{ title: "Vague", filter: "prevention", reason: "says nothing" }] }];
  return f;
}

/** The fixture with a refused topic in refused.md and three motifs the code drops. */
export function motifsDroppedByCode() {
  const f = setup();
  f.files.files.set(REFUSED, "# Refused motifs\n\nwording-of-help | ledger | 2026-10-01 | Wording of help texts\n");
  f.llm.extractions = [{
    motifs: [
      motif({ title: "Two batches only", topic: "two-batches", rows: [T.ledger1, T.ledger3] }),
      motif({ title: "Help wording", topic: "wording-of-help" }),
      motif({ title: "Rounding inside handlers", topic: "rounding", rows: [T.ledger1, T.ledger3, T.exports] }),
    ],
    dropped: [{ title: "Model's own", filter: "novelty", reason: "the guide says it" }],
  }];
  return f;
}

export const CODE_DROPS = [
  { title: "Two batches only", filter: "recurrence", reason: "2 batches (ledger/F1, ledger/F3)" },
  { title: "Help wording", filter: "novelty", reason: "refused on 2026-10-01 (.orkeon/memory/refused.md)" },
  { title: "Rounding inside handlers", filter: "novelty", reason: "refused in the harness's state" },
  { title: "Model's own", filter: "novelty", reason: "the guide says it" },
];

/** The fixture with two motifs removing a line the harness keeps, the second removing it alone. */
export function motifsRemovingAKeptLine() {
  const f = setup();
  f.llm.extractions = [{
    motifs: [
      motif({ status: "refines", lines_removed: ["each command returns a CommandView.", "Keep it short."] }),
      motif({ title: "Only the kept line", topic: "kept-line", rows: [T.exports, T.invoices, T.ledger1],
        status: "replaces", lines_removed: ["Each command returns a CommandView."] }),
    ],
  }];
  return f;
}

/** The fixture whose model names an unknown row first, then answers well. */
export function badThenGoodAnswer() {
  const f = setup();
  f.llm.extractions = [{ motifs: [motif({ rows: ["abc"] })] }, { motifs: [motif()] }];
  return f;
}

/** The fixture whose model fails both tries. */
export function twoFailedAnswers() {
  const f = setup();
  f.llm.extractions = [new Error("bad json\nat 3"), new Error("still bad")];
  return f;
}

/** The fixture with motifs owned by an absent file, by the harness, and refining a line nobody wrote. */
export function motifsWithAbsentOwners() {
  const f = setup();
  f.llm.extractions = [{
    motifs: [
      motif({ owner_path: "docs/missing.md" }),
      motif({ title: "Harness rule", topic: "harness-rule", rows: [T.exports, T.invoices, T.ledger1],
        owner_kind: "harness", owner_path: ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md" }),
      motif({ title: "Refines", topic: "refines", rows: [T.exports, T.ledger1, T.ledger3], key_term: "absent-term",
        status: "refines", lines_removed: ["A line nobody wrote."] }),
    ],
  }];
  return f;
}

/** An earlier run of 2026-10-20 that kept no motif for the Test axis's rows. */
export const EARLIER_NO_MOTIF: ProposalsFile = {
  version: 1, date: "2026-10-20", work: "workbench",
  read: { files: 7, gaps: 13, batches: 7, treatedOrkeon: 0, treatedHarness: 1, refused: 2 },
  axes: [{ axis: "Test", batches: 4, gaps: 5, shownRows: [T.ledger3, T.ledger1b, T.ledger1, T.invoices, T.exports], hiddenRows: 0,
    outcome: "no-motif", motifs: [], dropped: [] }],
};

/** The fixture with EARLIER_NO_MOTIF under learn-2026-10-20/. */
export function earlierRunKeptNoMotif() {
  const f = setup();
  f.files.listings.set(W, [...(f.files.listings.get(W) ?? []), "learn-2026-10-20/"]);
  f.files.files.set(`${W}/learn-2026-10-20/proposals.json`, JSON.stringify(EARLIER_NO_MOTIF));
  return f;
}

/** The fixture with two Test rows treated by Orkeon Code: no axis spans three batches. */
export function noAxisOverThree() {
  const f = setup();
  f.files.files.set(ORKEON_STATE, JSON.stringify({ version: 1, treated: [T.exports, T.invoices], decisions: [] }));
  return f;
}

/** HEAD once two rows are treated by Orkeon Code. */
export const HEAD_TWO_TREATED = HEAD.replace("13 untreated gaps across 7", "11 untreated gaps across 6").replace("0 by Orkeon Code", "2 by Orkeon Code");

/** The fixture with one motif and a disk where every write fails. */
export function diskFull() {
  const f = setup();
  f.llm.extractions = [{ motifs: [motif()] }];
  f.files.write = async (path: string) => { throw new Error(`disk full: ${path}`); };
  return f;
}

/** Axes the input refuses: a pipe, and a name over 40 characters. */
export const BAD_AXES: readonly string[] = ["a|b", "x".repeat(41)];
