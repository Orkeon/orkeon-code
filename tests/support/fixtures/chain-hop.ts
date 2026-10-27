// The deps of a chained hop (ChainHopDeps, src/commands/_lib/dev/dev-implement.ts) over plain fields, shared by the
// tests of /dev-implement's and /dev-batches' chains: what the gate answers and what the session reads again.
import type { ChainHopDeps } from "../../../src/commands/_lib/dev/dev-implement.ts";

/** The session's context as a hop reads it again. */
export const FRESH_CONTEXT = { permissionMode: "acceptEdits", permissionRules: ["deny file_write path=*.lock"], githubTool: true };

/** A hop's deps: `refusal` is what the gate answers (null: the rules went back), `context` what the session reads
 *  again, over FRESH_CONTEXT (an Error: the read throws); `reapplied` the steps put back, `reads` how many times the
 *  session was read. */
export function hopDeps(over: { refusal?: string | null; context?: object | Error } = {}): ChainHopDeps & { reapplied: string[]; reads: number } {
  const context = over.context ?? FRESH_CONTEXT;
  const deps = {
    reapplied: [] as string[],
    reads: 0,
    reapply: (step: string) => { deps.reapplied.push(step); return over.refusal ?? null; },
    context: async () => {
      deps.reads++;
      if (context instanceof Error) throw context;
      return { ...FRESH_CONTEXT, ...context };
    },
  };
  return deps;
}
