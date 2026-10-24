// /dev-implement: its arguments, and what its `completed` does with each answer of the chain. The
// crew answers JSON `{ lines, next? }`: the lines are printed and `next` (the audit, its input as the
// crew wrote it: mode, hooks, effort) is launched.
// /dev-verify, launched from here, drains to the same `completed` as plain text: printed, and on
// its VALID line the close is launched (`/dev-implement F<n> <plan> --close`). A launch that
// cannot run prints the command for the user instead. Pure but for the launch it is handed.
import { isCode } from "../../shared/domain/dev/artefacts.ts";

export const DEV_IMPLEMENT_USAGE =
  "usage: /dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr] | F<n> [<code> | <plan>] — correction: <finding>";
export interface DevImplementArgs { batch: string; plan: string | null; close: boolean; pr: boolean; correction: string | null }

const CORRECTION_WORD = /^correction:?(.*)$/i;

/** Splits `… — correction: <finding>` off the tokens: the ones before, and the finding (null without one). */
function splitCorrection(tokens: readonly string[]): { before: string[]; finding: string | null } {
  for (let i = 0; i < tokens.length; i++) {
    const dash = tokens[i] === "—" || tokens[i] === "--";
    const at = dash ? i + 1 : i;
    const word = tokens[at] ?? "";
    // Without the dash the word needs its colon: `correction` alone may be a plan's code.
    const m = dash || /^correction:/i.test(word) ? CORRECTION_WORD.exec(word) : null;
    if (m === null) {
      if (dash) return { before: [...tokens], finding: null };
      continue;
    }
    const finding = [m[1], ...tokens.slice(at + 1)].join(" ").replace(/\s+/g, " ").trim();
    return { before: tokens.slice(0, i), finding };
  }
  return { before: [...tokens], finding: null };
}

function isPlanPath(token: string): boolean {
  const relative = token.replace(/\\/g, "/");
  if (!relative.endsWith("-PLAN.md") || relative.startsWith("/")) return false;
  return !relative.split("/").includes("..");
}

export function parseDevImplementArgs(tokens: readonly string[]): { ok: true; args: DevImplementArgs } | { ok: false; text: string } {
  if (tokens.length === 0) return { ok: false, text: DEV_IMPLEMENT_USAGE };
  const [batch, ...all] = tokens;
  if (!/^F\d+$/.test(batch)) return { ok: false, text: `dev-implement: '${batch}' is not a batch: F<n>, e.g. F2` };
  const { before: rest, finding } = splitCorrection(all);
  if (finding !== null && finding === "") {
    return { ok: false, text: `dev-implement: a correction names its finding: /dev-implement ${batch} — correction: <the audit's gap>` };
  }
  let plan: string | null = null;
  let close = false;
  let pr = false;
  for (const tok of rest) {
    if (tok === "--close") close = true;
    else if (tok === "--pr") pr = true;
    else if (tok.startsWith("--")) return { ok: false, text: `dev-implement: unknown option '${tok}' (--close, --pr)` };
    else if (isCode(tok) || isPlanPath(tok)) {
      if (plan !== null) return { ok: false, text: `dev-implement: one plan at most, not '${plan}' and '${tok}'` };
      plan = tok;
    } else return { ok: false, text: `dev-implement: '${tok}' is neither a code nor a <CODE>-PLAN.md path` };
  }
  if (pr && !close) return { ok: false, text: "dev-implement: --pr goes with --close (the pull request is opened at the close)" };
  if (close && finding !== null) return { ok: false, text: "dev-implement: a correction runs the batch, --close commits it: one at a time" };
  return { ok: true, args: { batch, plan, close, pr, correction: finding } };
}

export interface ChainLaunch { crew: string; input: Record<string, unknown>; instead: string }
export interface ChainStep { lines: string[]; launch?: ChainLaunch }

const VALID_LINE = /^→ Batch (F\d+) VALID\./m;
const WRITTEN_LINE = /^written: (\S+)\/([A-Za-z0-9][A-Za-z0-9._-]*)-VERIFY-(F\d+)\.md\b/m;

/** What `completed` prints and launches for one answer of the chain. */
export function chainStep(payload: string): ChainStep {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(payload);
  } catch {
    parsed = null;
  }
  const answer = parsed as { lines?: unknown; next?: { crew?: unknown; input?: Record<string, unknown> } } | null;
  if (answer !== null && typeof answer === "object" && Array.isArray(answer.lines)) {
    const lines = answer.lines.map(String);
    const next = answer.next;
    if (next?.crew === "dev-verify" && next.input !== undefined) {
      const { batch, plan, mode } = next.input;
      const shownMode = mode === "resume" ? " resume" : "";
      return { lines, launch: { crew: "dev-verify", input: { ...next.input }, instead: `/dev-verify ${batch} ${plan}${shownMode}` } };
    }
    return { lines };
  }
  // /dev-verify's own answer, drained here by the chain.
  const lines = payload.split("\n");
  // The VALID line is /dev-verify's own: at the start of a line, after the verdict file's, for that file's batch; a
  // gap that quotes it from model text launches nothing.
  const written = WRITTEN_LINE.exec(payload);
  const valid = written === null ? null : VALID_LINE.exec(payload.slice(written.index + written[0].length));
  if (valid === null || written === null || valid[1] !== written[3]) return { lines };
  const plan = `${written[1]}/${written[2]}-PLAN.md`;
  return {
    lines: [...lines, `→ the close follows: /dev-implement ${valid[1]} ${plan} --close`],
    launch: { crew: "dev-implement", input: { batch: valid[1], plan, close: true }, instead: `/dev-implement ${valid[1]} ${plan} --close` },
  };
}
