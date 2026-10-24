// Shell adapter: shell_command pinned to the /workspace cwd the VFS mounts
// (SPEC §9.4), its result read once, whatever its casing. A timeout goes to the
// runtime's own `timeout_seconds`; a result with `completed: false` is read as a
// command stopped at that timeout (the typings give the field, not its meaning).

import type { Shell } from "../../application/ports.ts";
import { pick, shCode, shErr, shOut } from "./tool-results.ts";

const WORKING_DIRECTORY = "/workspace";

export function createShell(tools: Pick<OrkeonTools, "shellCommand">): Shell {
  return {
    async run(command, options) {
      const timeout = options?.timeoutSeconds;
      if (timeout !== undefined && !(Number.isInteger(timeout) && timeout >= 1)) {
        throw new Error(`a shell timeout is a whole number of seconds, at least 1: ${timeout}`);
      }
      const input = timeout === undefined
        ? { command, working_directory: WORKING_DIRECTORY }
        : { command, working_directory: WORKING_DIRECTORY, timeout_seconds: timeout };
      const r = await tools.shellCommand(input);
      const result = { stdout: shOut(r), stderr: shErr(r), exitCode: shCode(r) };
      return pick(r, "completed", "Completed") === false ? { ...result, timedOut: true } : result;
    },
  };
}
