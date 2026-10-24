// interim until RT-35
// The access cost of a batch: its type, and the text of the capture's `cost` section.
// Orkeon Code does not measure it yet; the measured shape is kept for the port. Pure.

export type AccessCost =
  | { state: "not-computed"; reason: string }
  | { state: "measured"; exit: 0 | 2; flagged: string[]; costLine: string; detail: string };

export const COST_NOT_COMPUTED: AccessCost = {
  state: "not-computed",
  reason:
    "Orkeon Code does not measure the access cost yet (it waits for the code graph's statement query); judge the Cost axis from the diff",
};

const DETAIL_LINES = 60;

export function costSection(cost: AccessCost): string {
  if (cost.state === "not-computed") return `not computed: ${cost.reason}\n`;
  const detail = cost.detail.split("\n");
  if (detail.length > 0 && detail[detail.length - 1] === "") detail.pop();
  const out = [`exit: ${cost.exit}`, ...detail.slice(0, DETAIL_LINES)];
  if (detail.length > DETAIL_LINES) out.push(`[cut at ${DETAIL_LINES} lines]`);
  out.push(cost.costLine);
  return `${out.join("\n")}\n`;
}
