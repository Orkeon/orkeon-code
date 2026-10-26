// The ProposalsFile literals PROPOSALS.md is rendered from, and the design's sample of it.
import type { AxisProposal, ProposalsFile } from "../../../../src/shared/domain/dev/learn-proposals.ts";

export const TEST_AXIS: AxisProposal = {
  axis: "Test", batches: 4, gaps: 7, shownRows: ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"], hiddenRows: 3,
  outcome: "proposed",
  motifs: [{
    id: "3f2a9c1e", title: "Refusal paths go untested", topic: "refusal-tests",
    rows: ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"], batches: ["ledger/F1", "ledger/F3", "invoices/F2"],
    preventiveLine: "Each refusal text of a command has a test that triggers it.",
    owner: { kind: "repository", path: "CONTRIBUTING.md" }, check: "test", status: "new",
    linesRemoved: [], linesAdded: ["Every refusal a command prints has a test that makes it print."],
    novelty: "…", keyTerm: "refusal", reconcile: "'refusal' not found in CONTRIBUTING.md",
  }],
  dropped: [{ title: "Wording of help texts", filter: "recurrence", reason: "2 batches (ledger/F1, ledger/F2)" }],
};
export const PLAN_AXIS: AxisProposal = {
  axis: "Plan", batches: 3, gaps: 4, shownRows: [], hiddenRows: 0, outcome: "no-proposal",
  reason: "motif 1: row 'abc' is not one of the rows given", motifs: [], dropped: [],
};
/** A run of 2026-10-22 with a proposed Test axis and a Plan axis whose answer did not parse. */
export const FILE: ProposalsFile = {
  version: 1, date: "2026-10-22", work: "workbench",
  read: { files: 9, gaps: 14, batches: 5, treatedOrkeon: 2, treatedHarness: 1, refused: 2 },
  axes: [TEST_AXIS, PLAN_AXIS],
};

/** PROPOSALS.md of FILE, as the design gives it. */
export const SAMPLE = [
  "# Learn proposals — 2026-10-22",
  "",
  "Work folder `workbench`: 14 untreated gaps across 5 batches in 9 verdict files. Treated before: 2 by Orkeon Code, 1 by the harness. Refused motifs: 2.",
  "",
  "## Test — 4 batches, 7 gaps",
  "",
  "| Id | Motif | Batches | Status | Owner | Check | Reconcile |",
  "|----|-------|---------|--------|-------|-------|-----------|",
  "| 3f2a9c1e | Refusal paths go untested | 3 | new | repository `CONTRIBUTING.md` | test | 'refusal' not found in CONTRIBUTING.md |",
  "",
  "Dropped: Wording of help texts — recurrence: 2 batches (ledger/F1, ledger/F2)",
  "Not shown to the model: 3 gaps (cap 40)",
  "",
  "### 3f2a9c1e — Refusal paths go untested",
  "",
  "- Rows: 68abc1ec48, 0b1c2d3e4f, 9a8b7c6d5e (batches ledger/F1, ledger/F3, invoices/F2)",
  "- Preventive line: Each refusal text of a command has a test that triggers it.",
  "- Why new: …",
  "- Lines:",
  "",
  "```diff",
  "file: CONTRIBUTING.md",
  "+ Every refusal a command prints has a test that makes it print.",
  "```",
  "",
  "## Plan — 3 batches, 4 gaps",
  "",
  "No proposal: the answer did not parse after one re-ask (motif 1: row 'abc' is not one of the rows given).",
  "",
  "## Decide",
  "",
  "```text",
  "/dev-learn --accept 3f2a9c1e",
  "/dev-learn --refuse 3f2a9c1e",
  "```",
  "",
].join("\n");

/** FILE with a Reuse axis that kept no motif and a Scope axis unchanged since an earlier run. */
export function fileWithOtherOutcomes(): ProposalsFile {
  const base = { batches: 3, gaps: 3, shownRows: [], hiddenRows: 0, motifs: [], dropped: [] };
  return {
    ...FILE,
    axes: [
      { ...base, axis: "Reuse", outcome: "no-motif", dropped: [{ title: "Dates", filter: "prevention", reason: "vague" }] },
      { ...base, axis: "Scope", outcome: "unchanged", reason: "learn-2026-10-20" },
    ],
  };
}

/** FILE whose Test axis holds a second motif, 77b0d2aa, refining a line. */
export function fileWithRefinesMotif(): ProposalsFile {
  const second = { ...TEST_AXIS.motifs[0], id: "77b0d2aa", status: "refines" as const, linesRemoved: ["Old line."] };
  return { ...FILE, axes: [{ ...TEST_AXIS, motifs: [TEST_AXIS.motifs[0], second] }] };
}

export interface CutCase {
  name: string;
  text: string;
  max: number;
  escaped: string;
}

/** Texts at and past the cut of escapeCell. */
export const CUT_CASES: readonly CutCase[] = [
  { name: "keeps a text of exactly max characters", text: "abcdef", max: 6, escaped: "abcdef" },
  { name: "cuts at max characters with an ellipsis", text: "abcdefg", max: 6, escaped: "abcde…" },
];
