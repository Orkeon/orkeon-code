// The access cost of a batch, measured by the runtime's `access_cost` over the code index: the
// reader of its report, the added lines of a diff, the mapping to `exit 0|2`, the flagged calls,
// the `Cost` line of the harness's access-cost.py, and the text of the capture's `cost` section.
// A port call, or an in-memory filter, inside a loop or a lambda blocks only on an added line, as
// `access-cost.py --diff` does. Pure.
import { WORKSPACE, workspaceRelative } from "../vfs.ts";

export type AccessCost =
  | { state: "not-computed"; reason: string }
  | { state: "measured"; exit: 0 | 2; flagged: string[]; costLine: string; detail: string };

export interface PortCall { receiver: string; method: string; line: number; inLoop: boolean; inLambda: boolean }
export interface MemoryFilter { line: number; method: string }
export interface CostTotals { reads: number; writes: number; loops: number; lambdas: number; memoryFilters: number }
export interface MemberCost { member: string; portCalls: PortCall[]; memoryFilters: MemoryFilter[]; cost: CostTotals }
export interface AccessCostReport { members: MemberCost[]; cost: CostTotals }

/** A root is a test root when its lower-case path holds "test" (AC:92,324). */
export function isTestRoot(root: string): boolean {
  return root.toLowerCase().includes("test");
}

/** Under a test root, or a path that says test (AC:326-331). */
export function isTestFile(path: string, testRoots: readonly string[]): boolean {
  for (const r of testRoots) if (path.startsWith(`${r.replace(/\/+$/, "")}/`)) return true;
  return path.toLowerCase().includes("test");
}

/** The cost when the crew wires no code index. */
export const COST_NOT_WIRED: AccessCost = {
  state: "not-computed",
  reason: "the crew wires no code index; judge the Cost axis from the diff",
};

export function notComputed(reason: string): AccessCost {
  return { state: "not-computed", reason };
}

/** No `/workspace` root in the index: the use case says so itself, the tool would answer an empty report. */
export function notIndexed(roots: readonly string[]): AccessCost {
  const holds = roots.length === 0 ? "the code index is empty" : `the code index holds ${roots.join(", ")}, not ${WORKSPACE}`;
  return notComputed(`not indexed — ${holds}: run /analyze, then audit the batch again; judge the Cost axis from the diff`);
}

/**
 * The runtime's default receivers (AccessCostService.cs:13-17), which a `receivers` argument replaces. Kept
 * here so that the pack's regex adds to it, as access-cost.py reads `tools.access_cost.receivers`.
 */
export const DEFAULT_RECEIVERS =
  "repositor|service|wrapper|client|provider|unitofwork|dbcontext|dbset|gateway|store|" +
  "publisher|bus|mediator|cache|queue|adapter|channel|hub|sandbox|filesystem|" +
  "^(this\\.)?_?(db|context|fs)$";

/** The `receivers` argument: none without the pack's regex, else the default or the pack's, case-insensitive. */
export function receiversArgument(pack: string | undefined): string | undefined {
  if (pack === undefined || pack.trim() === "") return undefined;
  return `(?i)(?:${DEFAULT_RECEIVERS})|(?:${pack.trim()})`;
}

/** The changed files the cost reads: under one of `roots` (all of them when `roots` is empty). */
export function underRoots(files: readonly string[], roots: readonly string[]): string[] {
  const kept = roots.map((r) => r.trim().replace(/^\.\//, "").replace(/\/+$/, ""));
  if (kept.length === 0 || kept.some((r) => r === "" || r === ".")) return [...files];
  return files.filter((f) => kept.some((r) => f === r || f.startsWith(`${r}/`)));
}

/** The 1-based line numbers a unified diff adds to the new file; null when the text holds no hunk. */
export function addedLines(diff: string): Set<number> | null {
  const added = new Set<number>();
  let line = 0;
  let inHunk = false;
  let hunks = 0;
  for (const text of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk !== null) { line = Number(hunk[1]); inHunk = true; hunks++; continue; }
    if (!inHunk) continue;
    if (text.startsWith("diff --git ")) { inHunk = false; continue; }
    if (text.startsWith("+")) { added.add(line); line++; }
    else if (text.startsWith(" ")) line++;
  }
  return hunks === 0 ? null : added;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function totals(raw: unknown): CostTotals | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const reads = num(r.reads), writes = num(r.writes), loops = num(r.loops), lambdas = num(r.lambdas);
  const memoryFilters = num(r.memory_filters);
  if (reads === null || writes === null || loops === null || lambdas === null || memoryFilters === null) return null;
  return { reads, writes, loops, lambdas, memoryFilters };
}

/** The `report` of `access_cost` (AccessCostDtos.cs, snake_case); null when a field is missing or mistyped. */
export function readAccessCostReport(raw: unknown): AccessCostReport | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const cost = totals(r.cost);
  if (cost === null || !Array.isArray(r.members)) return null;
  const members: MemberCost[] = [];
  for (const m of r.members as unknown[]) {
    if (m === null || typeof m !== "object") return null;
    const o = m as Record<string, unknown>;
    const memberCost = totals(o.cost);
    if (typeof o.member !== "string" || memberCost === null || !Array.isArray(o.port_calls) || !Array.isArray(o.in_memory_filters)) return null;
    const portCalls: PortCall[] = [];
    for (const c of o.port_calls as unknown[]) {
      const p = (c ?? {}) as Record<string, unknown>;
      const line = num(p.line);
      if (typeof p.receiver !== "string" || typeof p.method !== "string" || line === null) return null;
      portCalls.push({ receiver: p.receiver, method: p.method, line, inLoop: p.in_loop === true, inLambda: p.in_lambda === true });
    }
    const memoryFilters: MemoryFilter[] = [];
    for (const f of o.in_memory_filters as unknown[]) {
      const p = (f ?? {}) as Record<string, unknown>;
      const line = num(p.line);
      if (typeof p.method !== "string" || line === null) return null;
      memoryFilters.push({ line, method: p.method });
    }
    members.push({ member: o.member, portCalls, memoryFilters, cost: memberCost });
  }
  return { members, cost };
}

const LIST_MAX = 12;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The member as the capture shows it: its path relative to the checkout. */
function shownMember(fqn: string): string {
  return workspaceRelative(fqn);
}

/** The file of a member: its FQN up to the first `::` (UniversalSemanticMapper.cs:371). */
function fileOf(fqn: string): string {
  const at = fqn.indexOf("::");
  return at < 0 ? fqn : fqn.slice(0, at);
}

/** The `Cost` line of access-cost.py:261. */
export function costLineOf(reads: number, writes: number, blocking: number): string {
  const verdict = blocking === 0 ? "none" : `${blocking} - back to design`;
  return `Cost: ${plural(reads, "read")} + ${plural(writes, "write")} through ports outside loops; ` +
    `in a loop, a lambda or a memory filter: ${verdict}`;
}

/**
 * The measured cost of `report`. `added` maps a member's file (its virtual path) to the lines its diff adds;
 * a file absent from it, or mapped to null, has unknown lines, which count as added.
 */
export function measuredCost(report: AccessCostReport, added: ReadonlyMap<string, Set<number> | null>): AccessCost {
  const detail: string[] = [];
  const flagged: string[] = [];
  const isAdded = (fqn: string, line: number): boolean => {
    const lines = added.get(fileOf(fqn));
    return lines === undefined || lines === null || lines.has(line);
  };
  const show = (title: string, items: string[]): void => {
    if (items.length === 0) return;
    const more = items.length > LIST_MAX ? ` / … +${items.length - LIST_MAX}` : "";
    detail.push(`${title} (${items.length}): ${items.slice(0, LIST_MAX).join(" / ")}${more}`);
  };
  for (const m of report.members) {
    if (m.portCalls.length === 0 && m.memoryFilters.length === 0) continue;
    const member = shownMember(m.member);
    const flat: string[] = [], loop: string[] = [], lambda: string[] = [], filters: string[] = [];
    for (const c of m.portCalls) {
      const label = `${c.receiver}.${c.method} L${c.line}`;
      if (!c.inLoop && !c.inLambda) { flat.push(label); continue; }
      const where = c.inLoop ? "in a loop" : "in a lambda";
      const blocks = isAdded(m.member, c.line);
      (c.inLoop ? loop : lambda).push(blocks ? label : `${label} (pre-existing)`);
      if (blocks) flagged.push(`${member} L${c.line} ${c.receiver}.${c.method} ${where}`);
    }
    for (const f of m.memoryFilters) {
      const blocks = isAdded(m.member, f.line);
      filters.push(blocks ? `L${f.line} ${f.method}` : `L${f.line} ${f.method} (pre-existing)`);
      if (blocks) flagged.push(`${member} L${f.line} ${f.method} memory filter`);
    }
    detail.push(`[${member}]`);
    show("Ports outside loops", flat);
    show("Ports in a loop", loop);
    show("Ports in a lambda", lambda);
    show("Memory filter on an awaited result", filters);
  }
  if (detail.length === 0) {
    detail.push(report.members.length === 0
      ? "no member of the changed files in the code index"
      : `${plural(report.members.length, "member")}, none awaits a port or filters in memory`);
  }
  return {
    state: "measured",
    exit: flagged.length > 0 ? 2 : 0,
    flagged,
    costLine: costLineOf(report.cost.reads, report.cost.writes, flagged.length),
    detail: `${detail.join("\n")}\n`,
  };
}

/** A batch that changes no file under the cost roots: nothing to measure, nothing blocks. */
export function nothingChanged(roots: readonly string[]): AccessCost {
  const where = roots.length === 0 ? "" : ` under ${roots.join(" ")}`;
  return { state: "measured", exit: 0, flagged: [], costLine: costLineOf(0, 0, 0), detail: `no changed file${where}\n` };
}

/** The line the command prints under the gate's green line. */
export function costSummary(cost: AccessCost): string {
  return cost.state === "measured" ? cost.costLine : `Cost: not computed — ${cost.reason}`;
}

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
