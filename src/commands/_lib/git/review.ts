// /review [<path>…] [--files <path>…] [--commit <sha>] [--lens <lens>] [--passes <1-5>] — read the line of the review
// and of its two aliases. /security-review is the review narrowed to the security lens, whatever --lens says: one
// facet of the one crew, passed as a crew input so it outranks review.lenses, and inside the crew a security pass
// inherits the scope validation (a review asked to look at two paths looks at those two). /passes [n] shows or sets
// the session's pass count, answered here without a review; --passes sets this run's count only, the crew input
// outranking the session key. Lives under commands/_lib/ — the loader's SearchPattern is "*.cmd.ts".

import type { RunningCrews, SessionStore } from "../../../shared/application/ports.ts";
import { MAX_PASSES, MIN_PASSES } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { PASSES_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { commandLine, splitWords } from "../args.ts";
import type { CommandView } from "../view.ts";

export const REVIEW_LENSES: readonly string[] = ["correctness", "security", "style"];

/** The crew a review runs in. */
export const REVIEW_CREW = "code-review";

/** The refusal of a review asked while one runs (any alias: /security-review is the same crew), so two reviews
 *  never run side by side; undefined when none runs. Only a review is refused: /passes launches nothing. */
export function reviewBusyText(running: Pick<RunningCrews, "running">): string | undefined {
  const first = running.running(REVIEW_CREW)[0];
  return first === undefined ? undefined : `review: a review is already running (ticket ${first.ticket}): wait for its result`;
}

/** What the code-review crew is launched with. */
export interface ReviewInput {
  files: string[];
  commit: string;
  lenses: string;
  passes?: number;
}

export type ReviewRoute =
  | { route: "review"; input: ReviewInput }
  | { route: "passes"; token: string }
  | { route: "refused"; text: string };

/** The refusal of a pass count that is not an integer from 1 to 5. */
export function invalidPassesText(token: string): string {
  return `invalid pass count '${token}' — expected an integer between ${MIN_PASSES} and ${MAX_PASSES}.`;
}

/** A pass count from 1 to 5, or null. */
function passCount(token: string): number | null {
  const n = Number(token);
  return token !== "" && Number.isInteger(n) && n >= MIN_PASSES && n <= MAX_PASSES ? n : null;
}

/** `--name=value` split, or the bare option with no value. */
function option(token: string): { name: string; value: string | null } {
  const at = token.indexOf("=");
  return at < 0 ? { name: token, value: null } : { name: token.slice(0, at), value: token.slice(at + 1) };
}

/** The line of /review, or of the alias it was typed by (`security-review`, `passes`). The REPL keeps the quotes in
 *  the raw tokens: the line is split again, so `--commit "abc123"` reads `abc123` and a quoted path stays one file. */
export function parseReviewArgs(raw: readonly string[], typed: string): ReviewRoute {
  const tokens = splitWords(commandLine(raw)).map((w) => w.text);
  if (typed === "passes") return { route: "passes", token: (tokens[0] ?? "").trim() };
  const files: string[] = [];
  let commit = "";
  let lens = "";
  let passes: number | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith("--")) {
      files.push(token);
      continue;
    }
    const { name, value: inline } = option(token);
    if (name === "--files") {
      if (inline !== null && inline !== "") files.push(inline);
      while (i + 1 < tokens.length && !tokens[i + 1].startsWith("--")) files.push(tokens[++i]);
      continue;
    }
    if (name !== "--commit" && name !== "--lens" && name !== "--passes") {
      return { route: "refused", text: `review: unknown option '${token}' (--files, --commit, --lens, --passes)` };
    }
    const value = inline ?? (i + 1 < tokens.length && !tokens[i + 1].startsWith("--") ? tokens[++i] : "");
    if (value === "") return { route: "refused", text: `review: ${name} takes a value` };
    if (name === "--commit") commit = value;
    else if (name === "--lens") lens = value;
    else {
      const n = passCount(value);
      if (n === null) return { route: "refused", text: invalidPassesText(value) };
      passes = n;
    }
  }
  if (typed === "security-review") lens = "security";
  else if (lens !== "" && !REVIEW_LENSES.includes(lens)) {
    return { route: "refused", text: `review: --lens takes ${REVIEW_LENSES.join(", ")}, not '${lens}'` };
  }
  return { route: "review", input: { files, commit, lenses: lens, ...(passes === undefined ? {} : { passes }) } };
}

export interface PassesDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
}

/** `/passes [n]`: the session's pass count shown, or set from 1 to 5 (session-scoped; /clear clears it). */
export async function runPasses(token: string, deps: PassesDeps): Promise<CommandView> {
  if (token === "") {
    const current = (await deps.session.readState(PASSES_STATE_KEY).catch(() => null)) ?? `${MIN_PASSES} (default)`;
    return {
      text: `reasoning passes: ${current}\n/review runs that many lens rounds.\n` +
        `usage: /passes <${MIN_PASSES}-${MAX_PASSES}> (this session) or /review --passes <${MIN_PASSES}-${MAX_PASSES}> (one run)`,
    };
  }
  const n = passCount(token);
  if (n === null) return { text: invalidPassesText(token) };
  await deps.session.writeState(PASSES_STATE_KEY, String(n));
  // n rounds × 3 lenses is n × 3 LLM calls: say so, the cost is the operator's.
  return { text: `reasoning passes set to ${n} — /review will make ${n * 3} lens calls per run (session-scoped; /clear clears it).` };
}
