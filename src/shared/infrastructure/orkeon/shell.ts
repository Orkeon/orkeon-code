// Shell adapter: shell_command pinned to the /workspace cwd the VFS mounts
// (SPEC §9.4), its result read once, whatever its casing. A timeout goes to the
// runtime's own `timeout_seconds`; a result with `completed: false` is read as a
// command stopped at that timeout (the typings give the field, not its meaning).
// Given a batch's working root, the command runs there: its `/workspace` paths go
// onto the root, and the root's paths of its output come back as `/workspace`, so the
// callers keep naming the checkout `/workspace` (shared/domain/dev/path-rebase.ts).

import type { Shell } from "../../application/ports.ts";
import { textFromRoot, textToRoot } from "../../domain/dev/path-rebase.ts";
import { pick, shCode, shErr, shOut } from "./tool-results.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export function createShell(tools: Pick<OrkeonTools, "shellCommand">, root?: string): Shell {
  const cwd = root ?? WORKSPACE;
  return {
    async run(logical, options) {
      const command = textToRoot(logical, root);
      const timeout = options?.timeoutSeconds;
      if (timeout !== undefined && !(Number.isInteger(timeout) && timeout >= 1)) {
        throw new Error(`a shell timeout is a whole number of seconds, at least 1: ${timeout}`);
      }
      const input = timeout === undefined
        ? { command, working_directory: cwd }
        : { command, working_directory: cwd, timeout_seconds: timeout };
      const r = await tools.shellCommand(input);
      const result = { stdout: textFromRoot(shOut(r), root), stderr: textFromRoot(shErr(r), root), exitCode: shCode(r) };
      return pick(r, "completed", "Completed") === false ? { ...result, timedOut: true } : result;
    },
  };
}
