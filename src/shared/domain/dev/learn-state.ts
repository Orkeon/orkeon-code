// The /dev-learn state: the verdict rows already treated and the decision taken on each
// motif. Orkeon Code keeps its own file; the harness's file is only read, so a row the
// harness treated is not proposed again here. Pure, no IO.

/** Orkeon Code's own /dev-learn state, relative to /workspace (temp/04:172-175). */
export const LEARN_STATE_FILE = ".orkeon/dev-learn-state.json";
/** The harness's state (LC:11-12,82): read, never written. */
export const HARNESS_LEARN_STATE_FILE = ".claude/local/dev-learn-state.json";

export type Decision = "accepted" | "refused";
export interface DecisionRecord { motif: string; decision: Decision; date: string; axis: string; title: string }
export interface LearnState { version: 1; treated: string[]; decisions: DecisionRecord[] }
export interface HarnessLearnState { treated: string[]; refused: string[] }
export type StateRead<T> = { ok: true; state: T } | { ok: false; problem: string };

const RECORD_KEYS = ["motif", "date", "axis", "title"] as const;

export function emptyLearnState(): LearnState {
  return { version: 1, treated: [], decisions: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split("\n")[0];
}

function decisionRecord(v: unknown): DecisionRecord | null {
  if (!isRecord(v)) return null;
  if (v.decision !== "accepted" && v.decision !== "refused") return null;
  if (!RECORD_KEYS.every((k) => typeof v[k] === "string")) return null;
  return { motif: v.motif as string, decision: v.decision, date: v.date as string, axis: v.axis as string, title: v.title as string };
}

/** null text (absent file) → empty state. Invalid JSON or shape → a problem (never silently emptied). */
export function parseLearnState(text: string | null): StateRead<LearnState> {
  if (text === null) return { ok: true, state: emptyLearnState() };
  const wrong = (field: string): StateRead<LearnState> =>
    ({ ok: false, problem: `${LEARN_STATE_FILE}: ${field} has the wrong shape` });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, problem: `${LEARN_STATE_FILE} is not JSON (${firstLine(e)})` };
  }
  if (!isRecord(raw)) return wrong("the top level");
  if (raw.version !== 1) return wrong("version");
  if (!isStringList(raw.treated)) return wrong("treated");
  if (!Array.isArray(raw.decisions)) return wrong("decisions");
  const decisions: DecisionRecord[] = [];
  for (const [i, d] of raw.decisions.entries()) {
    const record = decisionRecord(d);
    if (record === null) return wrong(`decisions[${i}]`);
    decisions.push(record);
  }
  return { ok: true, state: { version: 1, treated: [...raw.treated], decisions } };
}

export function serializeLearnState(state: LearnState): string {
  return JSON.stringify(state, null, 1) + "\n";
}

/** As LC:95-106: anything unreadable or of the wrong shape counts as empty lists; non-string items are dropped. */
export function parseHarnessLearnState(text: string | null): HarnessLearnState {
  let raw: unknown = {};
  if (text !== null) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = {};
    }
  }
  const obj = isRecord(raw) ? raw : {};
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { treated: list(obj.treated), refused: list(obj.refused) };
}

/** The state with the decision recorded (replacing an earlier one on the same motif) and rows treated. */
export function withDecision(state: LearnState, record: DecisionRecord, rows: readonly string[]): LearnState {
  const treated = [...new Set([...state.treated, ...rows])].sort();
  const decisions = [...state.decisions.filter((d) => d.motif !== record.motif), { ...record }];
  return { version: 1, treated, decisions };
}

export function decisionOf(state: LearnState, motif: string): DecisionRecord | undefined {
  return state.decisions.find((d) => d.motif === motif);
}
