// The paths a role's write tools name, heard from its callbacks: a call of a file editor or a node editor
// the callbacks let through reports its `path`, and an edit_batch the path of each operation, so code
// tells a role's own changes from what its runs of run_tests or run_build left in the tree. The verdicts
// themselves are unchanged.
type Call = { name: string; input: unknown };
interface ActLike { onToolCall(call: Call): Promise<unknown> }
interface CallbacksLike { forAct(mode: string, gateEnabled: boolean | undefined): ActLike }

export const WRITE_TOOLS: readonly string[] = ["file_write", "edit_file", "node_replace", "node_insert", "node_ensure"];
export const BATCH_TOOL = "edit_batch";

/** The paths a write call names: its `path`, or each operation's of an edit_batch. */
export function writtenPaths(name: string, input: unknown): string[] {
  const args = input as { path?: unknown; operations?: unknown } | null;
  if (WRITE_TOOLS.includes(name)) return typeof args?.path === "string" ? [args.path] : [];
  if (name !== BATCH_TOOL || !Array.isArray(args?.operations)) return [];
  return args.operations.flatMap((op: unknown) => {
    const path = (op as { path?: unknown } | null)?.path;
    return typeof path === "string" ? [path] : [];
  });
}

/** The same callbacks, whose act callbacks also report each write they allow. */
export function reportingWrites<C extends CallbacksLike>(callbacks: C, wrote: (path: string) => void): C {
  return {
    ...callbacks,
    forAct(mode: string, gateEnabled: boolean | undefined) {
      const inner = callbacks.forAct(mode, gateEnabled);
      return {
        ...inner,
        async onToolCall(call: Call) {
          const verdict = await inner.onToolCall(call);
          if (verdict === "allow") writtenPaths(call.name, call.input).forEach(wrote);
          return verdict;
        },
      };
    },
  } as C;
}
