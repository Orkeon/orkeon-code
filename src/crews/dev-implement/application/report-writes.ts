// The paths a role's write tools name, heard from its callbacks: a call of a file editor or a node editor
// that ran reports its `path`, and an edit_batch the path of each operation, so code tells a role's own
// changes from what its runs of run_tests or run_build left in the tree. The write is reported from its
// result, not from the callback's verdict: the callback runs before the host's gate (Orkeon #303), and a call
// the gate refuses comes back as a `DENIED:` result, never written. The verdicts themselves are unchanged.
import { sameToolName } from "../../../shared/domain/agent-policy/permission.ts";

type Call = { name: string; input: unknown };
interface ActLike { onToolResult(call: Call, result: unknown): Promise<unknown> }
interface CallbacksLike { forAct(mode: string, gateEnabled: boolean | undefined): ActLike }

export const WRITE_TOOLS: readonly string[] = ["file_write", "edit_file", "node_replace", "node_insert", "node_ensure"];
export const BATCH_TOOL = "edit_batch";

/** The paths a write call names: its `path`, or each operation's of an edit_batch. */
export function writtenPaths(name: string, input: unknown): string[] {
  const args = input as { path?: unknown; operations?: unknown } | null;
  if (WRITE_TOOLS.some((t) => sameToolName(t, name))) return typeof args?.path === "string" ? [args.path] : [];
  if (!sameToolName(name, BATCH_TOOL) || !Array.isArray(args?.operations)) return [];
  return args.operations.flatMap((op: unknown) => {
    const path = (op as { path?: unknown } | null)?.path;
    return typeof path === "string" ? [path] : [];
  });
}

/** True for the result of a call the host refused (its gate or its guardian) instead of running it. */
export function refusedResult(result: unknown): boolean {
  return typeof result === "string" && result.startsWith("DENIED:");
}

/** The same callbacks, whose act callbacks also report each write that ran, from its result. */
export function reportingWrites<C extends CallbacksLike>(callbacks: C, wrote: (path: string) => void): C {
  return {
    ...callbacks,
    forAct(mode: string, gateEnabled: boolean | undefined) {
      const inner = callbacks.forAct(mode, gateEnabled);
      return {
        ...inner,
        async onToolResult(call: Call, result: unknown) {
          if (!refusedResult(result)) writtenPaths(call.name, call.input).forEach(wrote);
          return inner.onToolResult(call, result);
        },
      };
    },
  } as C;
}
