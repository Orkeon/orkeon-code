// The files a batch's roles changed, as code observed them, kept beside Orkeon's own state
// (`.orkeon/dev/<code>/implement-F<n>.json`, outside git) so that the close commits these files
// and no other, whichever run of the batch made them. The record also says whether the whole suite
// went green once for the batch (later runs run the affected tests only), and carries the pull-request
// context read at the launch, which the chained close reads back: the chain keeps no state of its own.
import type { Files } from "../../../shared/application/ports.ts";
import { contentHash } from "./observe.ts";

/** The mark of a verdict file's text: its hash, or "none" when there is no verdict file. */
export function verdictMarkOf(text: string | null): string {
  return text === null ? "none" : contentHash(text);
}

export function touchedPath(code: string, batch: string): string {
  return `/workspace/.orkeon/dev/${code}/implement-${batch}.json`;
}

/** What the close needs to open the pull request itself, as the command read it at the launch. */
export interface PrContext { githubTool: boolean; permissionMode: string; permissionRules: string[] }

export interface TouchedRecord {
  touched: string[];
  /** The whole suite went green once for this batch. */
  suiteGreen: boolean;
  pr: PrContext | null;
  /** The hash of the batch's verdict file when the list was last written ("none" without one): the close
   *  wants a verdict written since, so an audit older than the last change never commits it. */
  verdictMark: string | null;
}

export async function readTouchedRecord(files: Pick<Files, "read">, code: string, batch: string): Promise<TouchedRecord> {
  try {
    const parsed = JSON.parse(await files.read(touchedPath(code, batch))) as {
      touched?: unknown; verdictMark?: unknown; suiteGreen?: unknown; pr?: unknown;
    };
    return {
      touched: Array.isArray(parsed.touched) ? parsed.touched.filter((p): p is string => typeof p === "string") : [],
      verdictMark: typeof parsed.verdictMark === "string" ? parsed.verdictMark : null,
      suiteGreen: parsed.suiteGreen === true,
      pr: prContextOf(parsed.pr),
    };
  } catch {
    return { touched: [], verdictMark: null, suiteGreen: false, pr: null };
  }
}

/** A pull-request context from a record or a crew's input; null when it names none. */
export function prContextOf(raw: unknown): PrContext | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as { githubTool?: unknown; permissionMode?: unknown; permissionRules?: unknown };
  if (r.githubTool === undefined && r.permissionMode === undefined && r.permissionRules === undefined) return null;
  return {
    githubTool: r.githubTool === true || r.githubTool === "true",
    permissionMode: typeof r.permissionMode === "string" ? r.permissionMode : "",
    permissionRules: Array.isArray(r.permissionRules) ? r.permissionRules.filter((x): x is string => typeof x === "string") : [],
  };
}

/** Writes the record, the list sorted; a write that fails is said by the close, which then finds none. */
export async function recordTouched(
  files: Pick<Files, "write">, code: string, batch: string, touched: readonly string[], verdictMark: string,
  more: { suiteGreen?: boolean; pr?: PrContext | null } = {},
): Promise<void> {
  const record = {
    batch, touched: [...new Set(touched)].sort(), verdictMark,
    ...(more.suiteGreen === true ? { suiteGreen: true } : {}), ...(more.pr ? { pr: more.pr } : {}),
  };
  try {
    await files.write(touchedPath(code, batch), `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    // the close says it found no list
  }
}
