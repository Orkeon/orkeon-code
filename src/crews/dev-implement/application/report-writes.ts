// The paths a role's write tools name, heard from its callbacks: a file_write or edit_file call the
// callbacks let through reports its `path`, so code tells a role's own changes from what its runs of
// run_tests or run_build left in the tree. The verdicts themselves are unchanged.
type Call = { name: string; input: unknown };
interface ActLike { onToolCall(call: Call): Promise<unknown> }
interface CallbacksLike { forAct(mode: string, gateEnabled: boolean | undefined): ActLike }

export const WRITE_TOOLS: readonly string[] = ["file_write", "edit_file"];

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
          const path = (call.input as { path?: unknown } | null)?.path;
          if (verdict === "allow" && WRITE_TOOLS.includes(call.name) && typeof path === "string") wrote(path);
          return verdict;
        },
      };
    },
  } as C;
}
