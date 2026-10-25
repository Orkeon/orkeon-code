// The access_cost reports, diffs and file lists the access cost is tested on.
import type { AccessCostReport, CostTotals } from "./access-cost.ts";
import { readAccessCostReport } from "./access-cost.ts";

/** Totals of nothing, as access_cost writes them. */
export const ZERO = { reads: 0, writes: 0, loops: 0, lambdas: 0, memory_filters: 0 };

/** Totals of nothing, as the report reader gives them. */
export const ZERO_TOTALS: CostTotals = { reads: 0, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 };

/** A report as access_cost answers it (AccessCostDtos.cs). */
export function raw(): Record<string, unknown> {
  return {
    members: [
      {
        member: "/workspace/src/order.ts::OrderService::place",
        port_calls: [
          { receiver: "this.repository", method: "findById", line: 10, in_loop: false, in_lambda: false },
          { receiver: "this.repository", method: "save", line: 14, in_loop: true, in_lambda: false },
          { receiver: "this.bus", method: "publish", line: 20, in_loop: false, in_lambda: true },
        ],
        in_memory_filters: [{ line: 22, method: "Where" }],
        cost: { reads: 1, writes: 0, loops: 1, lambdas: 1, memory_filters: 1 },
      },
      { member: "/workspace/src/order.ts::OrderService::total", port_calls: [], in_memory_filters: [], cost: ZERO },
    ],
    cost: { reads: 1, writes: 0, loops: 1, lambdas: 1, memory_filters: 1 },
  };
}

/** The report `raw()` reads as. */
export function report(): AccessCostReport {
  const r = readAccessCostReport(raw());
  if (r === null) throw new Error("unreadable");
  return r;
}

/** Reports whose fields are missing or mistyped. */
export const UNREADABLE_REPORTS: ReadonlyArray<{ name: string; raw: unknown }> = [
  { name: "null", raw: null },
  { name: "no totals", raw: { members: [] } },
  { name: "a member named by a number", raw: { members: [{ member: 3, port_calls: [], in_memory_filters: [], cost: ZERO }], cost: ZERO } },
  { name: "a total as a string", raw: { members: [], cost: { ...ZERO, memory_filters: "1" } } },
  { name: "a port call without its line", raw: { members: [{ member: "m", port_calls: [{ receiver: "r", method: "m" }], in_memory_filters: [], cost: ZERO }], cost: ZERO } },
];

/** A diff of two hunks, a removed line and a no-newline marker. */
export const TWO_HUNKS = [
  "diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts",
  "@@ -1,3 +1,4 @@", " one", "-two", "+deux", "+trois", " four",
  "@@ -10 +11,2 @@", "+eleven", "\\ No newline at end of file", " twelve",
].join("\n");

/** The diff of a new file (--no-index). */
export const NEW_FILE_DIFF = "--- /dev/null\n+++ b/x.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n";

/** The changed files underRoots filters. */
export const FILES: readonly string[] = ["src/a.ts", "srcx/b.ts", "tests/a.test.ts", "src"];

/** Roots, and the files of FILES they keep. */
export const ROOT_CASES: ReadonlyArray<{ roots: readonly string[]; kept: readonly string[] }> = [
  { roots: ["src/"], kept: ["src/a.ts", "src"] },
  { roots: ["./src", "tests"], kept: ["src/a.ts", "tests/a.test.ts", "src"] },
  { roots: [], kept: FILES },
  { roots: ["."], kept: FILES },
];

/** Pack regexes that leave the runtime's default. */
export const NO_PACK_REGEX: ReadonlyArray<string | undefined> = [undefined, "  "];

/** Receivers, and whether the default regex takes them for a port. */
export const DEFAULT_RECEIVER_CASES: ReadonlyArray<{ receiver: string; port: boolean }> = [
  { receiver: "this.orderRepository", port: true },
  { receiver: "_db", port: true },
  { receiver: "validator", port: false },
];

/** The detail of the report when lines 14 and 22 of order.ts are added. */
export const PLACE_DETAIL = [
  "[src/order.ts::OrderService::place]",
  "Ports outside loops (1): this.repository.findById L10",
  "Ports in a loop (1): this.repository.save L14",
  "Ports in a lambda (1): this.bus.publish L20 (pre-existing)",
  "Memory filter on an awaited result (1): L22 Where",
  "",
].join("\n");

/** One member that awaits no port. */
export const QUIET_REPORT: AccessCostReport = {
  members: [{ member: "m", portCalls: [], memoryFilters: [], cost: { ...ZERO_TOTALS } }],
  cost: { ...ZERO_TOTALS },
};

/** No member at all. */
export const EMPTY_REPORT: AccessCostReport = { members: [], cost: { ...ZERO_TOTALS } };

/** A member making 14 port calls, as access_cost writes it. */
export function fourteenCalls(): Record<string, unknown> {
  const calls = Array.from({ length: 14 }, (_, i) => ({ receiver: "store", method: "get", line: i + 1, in_loop: false, in_lambda: false }));
  return { members: [{ member: "/workspace/a.ts::f", port_calls: calls, in_memory_filters: [], cost: { ...ZERO, reads: 14 } }], cost: { ...ZERO, reads: 14 } };
}

/** A measured detail of `count` lines, each named by `name`. */
export const detailOf = (count: number, name: (i: number) => string): string =>
  Array.from({ length: count }, (_, i) => name(i)).join("\n");
