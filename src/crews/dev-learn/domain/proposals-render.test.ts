// PROPOSALS.md rendered from a ProposalsFile literal: the design's sample byte for
// byte, each outcome other than proposed, and the cell escaping. Run:
//   node --test src/crews/dev-learn/domain/proposals-render.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import type { AxisProposal, ProposalsFile } from "../../../shared/domain/dev/learn-proposals.ts";
import { escapeCell, renderProposals } from "./proposals-render.ts";

const TEST_AXIS: AxisProposal = {
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
const PLAN_AXIS: AxisProposal = {
  axis: "Plan", batches: 3, gaps: 4, shownRows: [], hiddenRows: 0, outcome: "no-proposal",
  reason: "motif 1: row 'abc' is not one of the rows given", motifs: [], dropped: [],
};
const FILE: ProposalsFile = {
  version: 1, date: "2026-10-22", work: "workbench",
  read: { files: 9, gaps: 14, batches: 5, treatedOrkeon: 2, treatedHarness: 1, refused: 2 },
  axes: [TEST_AXIS, PLAN_AXIS],
};

const SAMPLE = [
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

describe("renderProposals", () => {
  it("renders the design's sample exactly", () => {
    strictEqual(renderProposals(FILE), SAMPLE);
  });

  it("renders each outcome other than proposed as one line, and nothing to decide", () => {
    const base = { batches: 3, gaps: 3, shownRows: [], hiddenRows: 0, motifs: [], dropped: [] };
    const text = renderProposals({
      ...FILE,
      axes: [
        { ...base, axis: "Reuse", outcome: "no-motif", dropped: [{ title: "Dates", filter: "prevention", reason: "vague" }] },
        { ...base, axis: "Scope", outcome: "unchanged", reason: "learn-2026-10-20" },
      ],
    });
    ok(text.includes("## Reuse — 3 batches, 3 gaps\n\nNo motif kept.\n\nDropped: Dates — prevention: vague\n"), text);
    ok(text.includes("## Scope — 3 batches, 3 gaps\n\nUnchanged since learn-2026-10-20: not asked again.\n"), text);
    ok(text.endsWith("## Decide\n\nNothing to decide.\n"), text);
  });

  it("lists a refines motif's removed lines before the added ones, and every id to decide", () => {
    const second = { ...TEST_AXIS.motifs[0], id: "77b0d2aa", status: "refines" as const, linesRemoved: ["Old line."] };
    const text = renderProposals({ ...FILE, axes: [{ ...TEST_AXIS, motifs: [TEST_AXIS.motifs[0], second] }] });
    ok(text.includes("file: CONTRIBUTING.md\n- Old line.\n+ Every refusal"), text);
    ok(text.includes("/dev-learn --accept 3f2a9c1e,77b0d2aa\n/dev-learn --refuse 3f2a9c1e\n/dev-learn --refuse 77b0d2aa\n"), text);
  });
});

describe("escapeCell", () => {
  it("turns pipes into slashes and line breaks into a middle dot", () => {
    strictEqual(escapeCell("open|done\nnext\r\nlast", 80), "open/done · next · last");
  });
  it("cuts at max characters with an ellipsis", () => {
    strictEqual(escapeCell("abcdef", 6), "abcdef");
    strictEqual(escapeCell("abcdefg", 6), "abcde…");
    strictEqual(Array.from(escapeCell("é".repeat(90), 80)).length, 80);
  });
});
