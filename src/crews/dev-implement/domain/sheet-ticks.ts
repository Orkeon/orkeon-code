// Ticking one box of one step's `TDD:` line, after code observed what the box stands for: the
// line of that step only, nothing else of the sheet. Idempotent: a box already ticked stays.
// Pure, never throws: what cannot be ticked comes back as a problem.
import { parseBatchSheet } from "../../../shared/domain/dev/plan-format.ts";

export type TddBox = "RED" | "GREEN" | "COST";

export type Ticked = { ok: true; text: string } | { ok: false; problem: string };

export function tickBox(sheet: string, step: number, box: TddBox): Ticked {
  const found = parseBatchSheet(sheet).steps.find((s) => s.number === step);
  if (found === undefined) return { ok: false, problem: `the sheet has no step ${step}` };
  if (found.tdd === null) return { ok: false, problem: `step ${step} has no TDD line` };
  const lines = sheet.split("\n");
  const at = found.tdd.line - 1;
  const line = lines[at] ?? "";
  if (!line.startsWith("TDD:")) return { ok: false, problem: `line ${found.tdd.line} is not step ${step}'s TDD line` };
  const box_ = new RegExp(`${box} \\[[ xX]\\]`);
  if (!box_.test(line)) return { ok: false, problem: `step ${step}'s TDD line has no ${box} box` };
  lines[at] = line.replace(new RegExp(`${box} \\[[ xX]\\]`), `${box} [x]`);
  return { ok: true, text: lines.join("\n") };
}
