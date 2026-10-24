// The shared-memory probe's verdict, pure: the reference set read from its YAML (the subset the
// fixture is written in), the recall@5 and MRR read from a rag_eval result, and the PASS/FAIL table
// against the thresholds of the design (recall@5 >= 0.85, MRR >= 0.70 over the cases that carry a
// `relevant`, so the negative q13 is left out; q08 never keeps a superseded id; q13 renders no block).
// The probe (probe.ork.ts) does the calls; tests/shared-memory-fixture.test.ts reads the fixture with it.
//
// Run tests: node --test src/crews/_probe-shared-memory/domain/probe-verdict.test.ts

export const RECALL_AT_5_MIN = 0.85;
export const MRR_MIN = 0.7;
export const EVAL_K = 5;
/** The case whose target supersedes another entry: the superseded id is never recalled. */
export const SUPERSESSION_CASE = "q08";
/** The case with no answer in the memory: the recall renders no block. */
export const NEGATIVE_CASE = "q13";

/** One case of the reference set (RagEvalDataset `cases[]`). */
export interface GoldenCase { id: string; question: string; relevant: string[]; tags: string[] }
/** The reference set (RagEvalDataset: `name`, `corpus`, `collection`, `cases`). */
export interface Golden { name: string; corpus: string; collection: string; cases: GoldenCase[] }

function scalar(raw: string): string {
  const text = raw.trim();
  if (text.startsWith("\"")) return JSON.parse(text) as string;
  return text;
}

function list(raw: string, where: string): string[] {
  const text = raw.trim();
  if (!text.startsWith("[") || !text.endsWith("]")) throw new Error(`${where}: an inline list [a, b] is expected`);
  const inner = text.slice(1, -1).trim();
  return inner === "" ? [] : inner.split(",").map((item) => scalar(item)).filter((item) => item !== "");
}

/**
 * The reference set, from the YAML subset the fixture uses: top-level `key: value` lines, then
 * `cases:` with `- id: ...` items whose keys are `question` (a scalar, double-quoted when it holds
 * ": "), `relevant` and `tags` (inline lists). Throws on anything else, naming the line.
 */
export function parseGolden(text: string): Golden {
  const top: Record<string, string> = {};
  const cases: GoldenCase[] = [];
  let inCases = false;
  let current: GoldenCase | null = null;
  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((line, i) => {
    const where = `golden line ${i + 1}`;
    if (line.trim() === "" || line.trim().startsWith("#")) return;
    if (!inCases) {
      const m = /^([a-z_]+):(?: (.*))?$/.exec(line);
      if (!m) throw new Error(`${where}: not a top-level key: value`);
      if (m[1] === "cases" && (m[2] ?? "").trim() === "") { inCases = true; return; }
      top[m[1]] = scalar(m[2] ?? "");
      return;
    }
    const item = /^ {2}- id: (.+)$/.exec(line);
    if (item) {
      current = { id: scalar(item[1]), question: "", relevant: [], tags: [] };
      cases.push(current);
      return;
    }
    const field = /^ {4}([a-z_]+): (.*)$/.exec(line);
    if (!field || current === null) throw new Error(`${where}: not a case field`);
    const c: GoldenCase = current;
    if (field[1] === "question") c.question = scalar(field[2]);
    else if (field[1] === "relevant") c.relevant = list(field[2], where);
    else if (field[1] === "tags") c.tags = list(field[2], where);
    else throw new Error(`${where}: unknown case key '${field[1]}'`);
  });
  for (const key of ["name", "corpus", "collection"]) {
    if ((top[key] ?? "") === "") throw new Error(`golden: '${key}' is missing`);
  }
  if (cases.length === 0) throw new Error("golden: no case");
  return { name: top.name, corpus: top.corpus, collection: top.collection, cases };
}

const pick = (obj: unknown, ...names: string[]): unknown => {
  if (obj === null || typeof obj !== "object") return undefined;
  for (const name of names) {
    const value = (obj as Record<string, unknown>)[name];
    if (value !== undefined) return value;
  }
  return undefined;
};

/** The rag_eval result as an object (a tool may hand back its JSON as text). */
function resultObject(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try { return JSON.parse(result); } catch { return undefined; }
}

export interface RetrievalScores {
  /** Mean recall@k over the gated cases. */
  recall: number;
  /** Mean reciprocal rank over the gated cases. */
  mrr: number;
  /** The gated cases: the ones with a `relevant`. */
  gated: string[];
  /** Gated cases the result does not report: counted as 0. */
  missing: string[];
}

/** recall@5 and MRR over the cases that carry a `relevant`, from rag_eval's per-case rows. */
export function retrievalScores(golden: Golden, result: unknown): RetrievalScores {
  const rows = pick(resultObject(result), "cases", "Cases");
  const byId = new Map<string, { recall: number; rr: number }>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const id = String(pick(row, "case_id", "caseId", "CaseId") ?? "");
      if (id === "") continue;
      byId.set(id, {
        recall: Number(pick(row, "recall_at_k", "recallAtK", "RecallAtK") ?? 0),
        rr: Number(pick(row, "reciprocal_rank", "reciprocalRank", "ReciprocalRank") ?? 0),
      });
    }
  }
  const gated = golden.cases.filter((c) => c.relevant.length > 0).map((c) => c.id);
  const missing = gated.filter((id) => !byId.has(id));
  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0) / values.length;
  return {
    recall: mean(gated.map((id) => byId.get(id)?.recall ?? 0)),
    mrr: mean(gated.map((id) => byId.get(id)?.rr ?? 0)),
    gated,
    missing,
  };
}

export interface ProbeRow { check: string; value: string; threshold: string; pass: boolean }

export interface ProbeFacts {
  scores: RetrievalScores;
  /** The ids recallEntries kept for the supersession case, and the ids its target supersedes. */
  supersession: { recalled: string[]; superseded: string[] } | { error: string };
  /** The precedents block recallEntries + buildPrecedentsBlock render for the negative case. */
  negative: { block: string; recalled: string[] } | { error: string };
}

const fixed = (n: number): string => n.toFixed(3);

/** The four gated rows of the probe. */
export function probeRows(facts: ProbeFacts): ProbeRow[] {
  const { scores } = facts;
  const over = `${scores.gated.length} cases${scores.missing.length > 0 ? `, missing ${scores.missing.join(" ")}` : ""}`;
  const rows: ProbeRow[] = [
    { check: `recall@${EVAL_K} (${over})`, value: fixed(scores.recall), threshold: `>= ${RECALL_AT_5_MIN}`, pass: scores.recall >= RECALL_AT_5_MIN },
    { check: `MRR (${over})`, value: fixed(scores.mrr), threshold: `>= ${MRR_MIN}`, pass: scores.mrr >= MRR_MIN },
  ];
  const s = facts.supersession;
  if ("error" in s) {
    rows.push({ check: `${SUPERSESSION_CASE} superseded id never kept`, value: `error: ${s.error}`, threshold: "none kept", pass: false });
  } else {
    const kept = s.recalled.filter((id) => s.superseded.includes(id));
    rows.push({
      check: `${SUPERSESSION_CASE} superseded id never kept`,
      value: kept.length > 0 ? `kept ${kept.join(" ")}` : `kept ${s.recalled.length}, none superseded`,
      threshold: "none kept",
      pass: s.superseded.length > 0 && kept.length === 0,
    });
  }
  const n = facts.negative;
  if ("error" in n) {
    rows.push({ check: `${NEGATIVE_CASE} renders no block`, value: `error: ${n.error}`, threshold: "no block", pass: false });
  } else {
    rows.push({
      check: `${NEGATIVE_CASE} renders no block`,
      value: n.block === "" ? "no block" : `block of ${n.recalled.length} (${n.recalled.join(" ")})`,
      threshold: "no block",
      pass: n.block === "",
    });
  }
  return rows;
}

export const VERDICT_PREFIX = "shared-memory probe:";

/** The rows as a Markdown table, then one verdict line `shared-memory probe: PASS|FAIL`. */
export function renderProbeTable(rows: readonly ProbeRow[]): string {
  const lines = ["| Check | Value | Threshold | Result |", "|---|---|---|---|"];
  for (const r of rows) lines.push(`| ${r.check} | ${r.value} | ${r.threshold} | ${r.pass ? "PASS" : "FAIL"} |`);
  lines.push("", `${VERDICT_PREFIX} ${rows.length > 0 && rows.every((r) => r.pass) ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}
