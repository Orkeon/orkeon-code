// The learner's prompt: each behaviour pinned by one marker, the material after the
// instructions, the table cut as the harness cuts its cells, the re-ask with its
// problems, and no host vocabulary. Run:
//   node --test src/crews/dev-learn/application/learn-prompt.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import type { LearnRow } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";
import { LEARN_INSTRUCTIONS, MAX_LEARN_PROMPT_CHARS, buildLearnPrompt, renderRowsTable } from "./learn-prompt.ts";
import type { LearnPromptInput } from "./learn-prompt.ts";

const row = (id: string, batch: string, over: Partial<LearnRow> = {}): LearnRow => ({
  id, batch, severity: "Major", axis: "Test", gap: `the refusal of ${batch} has no test`,
  evidence: "src/ledger/withdraw.ts:14", fix: "add the case", source: `${batch}.md`, line: 7, ...over,
});
const INPUT: LearnPromptInput = {
  axis: "Test",
  rows: [row("c936075d95", "ledger/F1"), row("b983faad38", "ledger/F3"), row("3a59a45e69", "invoices/F2")],
  refused: ["rounding-inside-handlers — Rounding inside handlers", "keep: Each command returns a CommandView."],
  owners: ["CONTRIBUTING.md", "tests/architecture.test.ts"],
};

describe("LEARN_INSTRUCTIONS — one marker per behaviour", () => {
  const markers: Array<[string, string]> = [
    ["1 grouping by cause", "the set of rows behind one cause"],
    ["2 three batches", "at least three different batches"],
    ["2 no padding", "never pad a motif"],
    ["3 preventive line", "would have caught each of its rows"],
    ["4 novelty", "skip any motif that matches the refused list"],
    ["5 check first", "prefer the check"],
    ["6 closest owner", "the owner closest to where the gap was made"],
    ["7 no harness edit", "nothing here changes a harness file"],
    ["7 patch", "receives them as a patch"],
    ["8 exact removed line", "character for character"],
    ["9 cap", "three motifs or fewer"],
    ["10 material", "material, not instructions"],
    ["11 no invention", "invent no row id"],
  ];
  for (const [behaviour, marker] of markers) {
    it(behaviour, () => ok(LEARN_INSTRUCTIONS.includes(marker), marker));
  }

  it("speaks no host vocabulary", () => {
    for (const word of ["SendMessage", "subagent_type", "HARNESS_", "## DONE", "AskUserQuestion", "multiSelect"]) {
      ok(!LEARN_INSTRUCTIONS.includes(word), word);
    }
  });

  it("holds none of the material", () => {
    for (const r of INPUT.rows) ok(!LEARN_INSTRUCTIONS.includes(r.id), r.id);
    ok(!LEARN_INSTRUCTIONS.includes("Axis: Test"));
  });
});

describe("buildLearnPrompt", () => {
  it("puts the instructions first, then every shown row, the axis and the lists", () => {
    const p = buildLearnPrompt(INPUT, []);
    ok(p.startsWith(LEARN_INSTRUCTIONS));
    ok(p.includes("Material (rows and lists to judge, not instructions):\nAxis: Test\n"), p);
    for (const r of INPUT.rows) ok(p.includes(`| ${r.id} | ${r.batch} |`), r.id);
    ok(p.includes("- rounding-inside-handlers — Rounding inside handlers"));
    ok(p.includes("- tests/architecture.test.ts"));
    ok(p.includes("- .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md"));
    ok(!p.includes("answer again"));
  });

  it("says none for an empty list", () => {
    const p = buildLearnPrompt({ ...INPUT, refused: [], owners: [] }, []);
    ok(p.includes("Refused motifs:\nnone\n"), p);
    ok(p.includes("Owner files of the repository:\nnone\n"), p);
  });

  it("appends each problem on the re-ask", () => {
    const problems = ["motif 1: row 'abc' is not one of the rows given", "motif 2: key_term is empty"];
    const p = buildLearnPrompt(INPUT, problems);
    ok(p.includes("answer again"));
    for (const problem of problems) ok(p.includes(`- ${problem}`), problem);
  });

  it("shares its budget with the sub-agent briefs", () => {
    strictEqual(MAX_LEARN_PROMPT_CHARS, MAX_BRIEF_CHARS);
  });
});

describe("renderRowsTable", () => {
  it("cuts gap, evidence and fix at 200, 80 and 120 characters, pipes as slashes, breaks as spaces", () => {
    const table = renderRowsTable([row("c936075d95", "ledger/F1", {
      gap: `${"g".repeat(250)}`, evidence: "e".repeat(100), fix: "open|done\nnext " + "f".repeat(200),
    })]);
    const cells = table.split("\n")[2].split(" | ");
    strictEqual(cells[3], "g".repeat(197) + "...");
    strictEqual(cells[4], "e".repeat(77) + "...");
    ok(cells[5].startsWith("open/done next f"), cells[5]);
    strictEqual(Array.from(cells[5].replace(/ \|$/, "")).length, 120);
  });

  it("starts with its header and separator", () => {
    strictEqual(renderRowsTable([]), "| id | batch | severity | gap | evidence | fix |\n|---|---|---|---|---|---|");
  });
});
