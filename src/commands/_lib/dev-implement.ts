// /dev-implement: its arguments, and what its `completed` does with each answer of the chain. The
// crew answers JSON `{ lines, next? }`: the lines are printed and `next` (the audit) is launched.
// /dev-verify, launched from here, drains to the same `completed` as plain text: printed, and on
// its VALID line the close is launched (`/dev-implement F<n> <plan> --close`). A launch that
// cannot run prints the command for the user instead. Pure but for the launch it is handed.
import { isCode } from "../../shared/domain/dev/artefacts.ts";

export const DEV_IMPLEMENT_USAGE = "usage: /dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr]";
export interface DevImplementArgs { batch: string; plan: string | null; close: boolean; pr: boolean }

function isPlanPath(token: string): boolean {
  const relative = token.replace(/\\/g, "/");
  if (!relative.endsWith("-PLAN.md") || relative.startsWith("/")) return false;
  return !relative.split("/").includes("..");
}

export function parseDevImplementArgs(tokens: readonly string[]): { ok: true; args: DevImplementArgs } | { ok: false; text: string } {
  if (tokens.length === 0) return { ok: false, text: DEV_IMPLEMENT_USAGE };
  const [batch, ...rest] = tokens;
  if (!/^F\d+$/.test(batch)) return { ok: false, text: `dev-implement: '${batch}' is not a batch: F<n>, e.g. F2` };
  if (rest[0] === "—" || rest[0] === "--" || /^correction:?$/.test(rest[0] ?? "")) {
    return {
      ok: false,
      text: `dev-implement: a correction (${batch} — correction: <finding>) is not run by Orkeon Code yet: ` +
        `run it in the harness (/dev-implement ${batch} — correction: …), then /dev-verify ${batch} resume`,
    };
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
  return { ok: true, args: { batch, plan, close, pr } };
}

export interface ChainLaunch { crew: string; input: Record<string, unknown>; instead: string }
export interface ChainStep { lines: string[]; launch?: ChainLaunch }

const VALID_LINE = /→ Batch (F\d+) VALID\./;
const WRITTEN_LINE = /^written: (\S+)\/([A-Za-z0-9][A-Za-z0-9._-]*)-VERIFY-F\d+\.md\b/m;

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
      const { batch, plan } = next.input;
      return { lines, launch: { crew: "dev-verify", input: { batch, plan }, instead: `/dev-verify ${batch} ${plan}` } };
    }
    return { lines };
  }
  // /dev-verify's own answer, drained here by the chain.
  const lines = payload.split("\n");
  const valid = VALID_LINE.exec(payload);
  const written = WRITTEN_LINE.exec(payload);
  if (valid === null || written === null) return { lines };
  const plan = `${written[1]}/${written[2]}-PLAN.md`;
  return {
    lines: [...lines, `→ the close follows: /dev-implement ${valid[1]} ${plan} --close`],
    launch: { crew: "dev-implement", input: { batch: valid[1], plan, close: true }, instead: `/dev-implement ${valid[1]} ${plan} --close` },
  };
}
