// The log of a `/dev-batches` run, `<CODE>-BATCHES-STATE.md`, read only. Pure, no IO.
// A batch is open when its last entry is `launched`, `relaunched` or `stall` and no
// `closed` line follows it; any other line (a table, prose) is ignored.

/** The record of the /dev-batches run in progress (its `code`), cleared when the run closes. A close of one of its
 *  batches, typed or chained, commits without pushing: the run's close pushes the plan's branch once. */
export const BATCHES_ACTIVE_RECORD = "/workspace/.orkeon/dev/batches-active.json";

/** The code the record names, or null (no record, unreadable). Pure: the record's text. */
export function batchesRunCode(text: string): string | null {
  try {
    const code = (JSON.parse(text) as { code?: unknown } | null)?.code;
    return typeof code === "string" && code !== "" ? code : null;
  } catch {
    return null;
  }
}

export interface BatchesLogEntry { date: string; time: string; batch?: string; event: string; detail: string; line: number }
export interface BatchesState { entries: BatchesLogEntry[]; closed: boolean; open: string[] }

const EVENT = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (F\d+) (launched|relaunched|returned|merged|stopped|stall)( .*)?$/;
const CLOSE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) closed$/;
const OPENING: ReadonlySet<string> = new Set(["launched", "relaunched", "stall"]);

export function parseBatchesState(text: string): BatchesState {
  const entries: BatchesLogEntry[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trimEnd();
    const e = EVENT.exec(t);
    if (e) {
      entries.push({ date: e[1], time: e[2], batch: e[3], event: e[4], detail: (e[5] ?? "").trim(), line: i + 1 });
      return;
    }
    const c = CLOSE.exec(t);
    if (c) entries.push({ date: c[1], time: c[2], event: "closed", detail: "", line: i + 1 });
  });
  const last = new Map<string, number>();
  let lastClose = -1;
  entries.forEach((e, i) => {
    if (e.batch === undefined) lastClose = i;
    else last.set(e.batch, i);
  });
  const open: string[] = [];
  for (const [batch, i] of last) if (OPENING.has(entries[i].event) && i > lastClose) open.push(batch);
  const closed = entries.length > 0 && entries[entries.length - 1].event === "closed";
  return { entries, closed, open };
}
