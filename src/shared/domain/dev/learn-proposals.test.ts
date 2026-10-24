// The proposals model of /dev-learn: ids, the proposals.json file, the lines a decision
// prints. Run:
//   node --test src/shared/domain/dev/learn-proposals.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { sha1Hex } from "../sha1.ts";
import {
  LEARN_FOLDER_PATTERN, PROPOSALS_JSON, PROPOSALS_MD, acceptLines, deployedHarnessPath, learnFolderName, motifId,
  parseProposalsFile, patchLines, serializeProposalsFile,
} from "./learn-proposals.ts";
import type { Motif, ProposalsFile } from "./learn-proposals.ts";

const REPO_MOTIF: Motif = {
  id: "3f2a9c1e", title: "Refusal paths go untested", topic: "refusal-paths-untested",
  rows: ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"], batches: ["ledger/F1", "ledger/F3", "invoices/F2"],
  preventiveLine: "Each refusal text of a command has a test that triggers it.",
  owner: { kind: "repository", path: "CONTRIBUTING.md" }, check: "test", status: "new",
  linesRemoved: [], linesAdded: ["Every refusal a command prints has a test that makes it print."],
  novelty: "No rule names refusal texts.", keyTerm: "refusal", reconcile: "'refusal' not found in CONTRIBUTING.md",
};
const HARNESS_MOTIF: Motif = {
  ...REPO_MOTIF, id: "77b0d2aa", title: "Axis names drift",
  owner: { kind: "harness", path: ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md" },
  check: "rule", status: "refines",
  linesRemoved: ["Name the axis."], linesAdded: ["Name the axis with one of the listed words.", "Keep the case."],
};
const FILE: ProposalsFile = {
  version: 1, date: "2026-10-22", work: "workbench",
  read: { files: 9, gaps: 14, batches: 5, treatedOrkeon: 2, treatedHarness: 1, refused: 2 },
  axes: [
    {
      axis: "Test", batches: 4, gaps: 7, shownRows: ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"], hiddenRows: 3,
      outcome: "proposed", motifs: [REPO_MOTIF, HARNESS_MOTIF],
      dropped: [{ title: "Wording of help texts", filter: "recurrence", reason: "2 batches (ledger/F1, ledger/F2)" }],
    },
    {
      axis: "Plan", batches: 3, gaps: 4, shownRows: ["1111111111"], hiddenRows: 0, outcome: "no-proposal",
      reason: "motif 1: row 'abc' is not one of the rows given", motifs: [], dropped: [],
    },
  ],
};

describe("names", () => {
  it("the learn folder and its two files", () => {
    strictEqual(learnFolderName("2026-10-22"), "learn-2026-10-22");
    strictEqual(LEARN_FOLDER_PATTERN.test("learn-2026-10-22"), true);
    for (const name of ["learn-2026-10-2", "learn-2026-10-22x", "xlearn-2026-10-22", "learn-latest"]) {
      strictEqual(LEARN_FOLDER_PATTERN.test(name), false, name);
    }
    deepStrictEqual([PROPOSALS_JSON, PROPOSALS_MD], ["proposals.json", "PROPOSALS.md"]);
  });
});

describe("motifId", () => {
  it("is 8 hex digits of the SHA-1 of the axis and the sorted rows, whatever the row order", () => {
    const id = motifId("Test", ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"]);
    strictEqual(/^[0-9a-f]{8}$/.test(id), true);
    strictEqual(id, sha1Hex("Test|0b1c2d3e4f,68abc1ec48,9a8b7c6d5e").slice(0, 8));
    strictEqual(motifId("Test", ["9a8b7c6d5e", "68abc1ec48", "0b1c2d3e4f"]), id);
    strictEqual(motifId("Plan", ["68abc1ec48", "0b1c2d3e4f", "9a8b7c6d5e"]) === id, false);
  });
});

describe("parseProposalsFile", () => {
  it("round trips through serializeProposalsFile, one-space indented with a final line break", () => {
    const text = serializeProposalsFile(FILE);
    strictEqual(text, JSON.stringify(FILE, null, 1) + "\n");
    deepStrictEqual(parseProposalsFile(text), { ok: true, file: FILE });
  });

  it("invalid JSON is a one-line problem", () => {
    const r = parseProposalsFile("{");
    strictEqual(r.ok, false);
    if (!r.ok) strictEqual(/^not JSON \([^\n]+\)$/.test(r.problem), true, r.problem);
  });

  it("names the first field of the wrong shape", () => {
    const motif = (patch: object) => ({ ...FILE, axes: [{ ...FILE.axes[0], motifs: [REPO_MOTIF, { ...HARNESS_MOTIF, ...patch }] }] });
    const cases: [unknown, string][] = [
      [[], "the top level"],
      [{ ...FILE, version: 2 }, "version"],
      [{ ...FILE, date: 5 }, "date"],
      [{ ...FILE, read: { ...FILE.read, gaps: -1 } }, "read.gaps"],
      [{ ...FILE, read: null }, "read"],
      [{ ...FILE, axes: {} }, "axes"],
      [{ ...FILE, axes: [{ ...FILE.axes[0], outcome: "done" }] }, "axes[0].outcome"],
      [{ ...FILE, axes: [FILE.axes[0], { ...FILE.axes[1], reason: 3 }] }, "axes[1].reason"],
      [{ ...FILE, axes: [{ ...FILE.axes[0], shownRows: [1] }] }, "axes[0].shownRows"],
      [motif({ id: "3F2A9C1E" }), "axes[0].motifs[1].id"],
      [motif({ owner: { kind: "team", path: "x" } }), "axes[0].motifs[1].owner.kind"],
      [motif({ owner: "x" }), "axes[0].motifs[1].owner"],
      [motif({ check: "lint" }), "axes[0].motifs[1].check"],
      [motif({ linesAdded: "x" }), "axes[0].motifs[1].linesAdded"],
      [{ ...FILE, axes: [{ ...FILE.axes[0], dropped: [{ title: "t", filter: "other", reason: "r" }] }] }, "axes[0].dropped[0].filter"],
    ];
    for (const [value, field] of cases) {
      deepStrictEqual(parseProposalsFile(JSON.stringify(value)), { ok: false, problem: `${field} has the wrong shape` }, field);
    }
  });

  it("accepts a 10-digit motif id (collision fallback)", () => {
    const file = { ...FILE, axes: [{ ...FILE.axes[0], motifs: [{ ...REPO_MOTIF, id: "3f2a9c1e00" }] }] };
    strictEqual(parseProposalsFile(JSON.stringify(file)).ok, true);
  });
});

describe("deployedHarnessPath", () => {
  it("maps a pack's claude folder onto .claude/ of the checkout", () => {
    strictEqual(deployedHarnessPath(".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md"),
      ".claude/skills/dev-verify/references/audit-axes.md");
    strictEqual(deployedHarnessPath(".devcontainer/harness/packs/repo-x/claude/rules/naming.md"), ".claude/rules/naming.md");
  });

  it("any other path gives null", () => {
    for (const path of [
      "CONTRIBUTING.md", ".claude/rules/naming.md", ".devcontainer/harness/packs/dev/skills/x.md",
      ".devcontainer/harness/packs/dev/claude/", "x/.devcontainer/harness/packs/dev/claude/rules/a.md",
      ".devcontainer/harness/packs/dev/claude/../../etc/passwd", "",
    ]) strictEqual(deployedHarnessPath(path), null, path);
  });
});

describe("patchLines and acceptLines", () => {
  it("a harness owner: the patch for the orkeon-workshop repository", () => {
    deepStrictEqual(patchLines(HARNESS_MOTIF), [
      "file: .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
      "- Name the axis.",
      "+ Name the axis with one of the listed words.",
      "+ Keep the case.",
    ]);
    deepStrictEqual(acceptLines(HARNESS_MOTIF), [
      "accepted 77b0d2aa — Axis names drift: a harness file is never edited here; apply this in the orkeon-workshop repository:",
      "  file: .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
      "  - Name the axis.",
      "  + Name the axis with one of the listed words.",
      "  + Keep the case.",
    ]);
  });

  it("a repository owner: the change to make in a batch", () => {
    deepStrictEqual(patchLines(REPO_MOTIF), [
      "file: CONTRIBUTING.md",
      "+ Every refusal a command prints has a test that makes it print.",
    ]);
    deepStrictEqual(acceptLines(REPO_MOTIF), [
      "accepted 3f2a9c1e — Refusal paths go untested: CONTRIBUTING.md is not edited by /dev-learn; make the change in a batch (/dev-change, or by hand):",
      "  file: CONTRIBUTING.md",
      "  + Every refusal a command prints has a test that makes it print.",
    ]);
  });
});
