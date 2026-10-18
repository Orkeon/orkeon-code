// Shell adapter: shell_command pinned to the /workspace cwd the VFS mounts
// (SPEC §9.4), its result read once, whatever its casing.

import type { Shell } from "../../application/ports.ts";
import { shCode, shErr, shOut } from "./tool-results.ts";

const WORKING_DIRECTORY = "/workspace";

export function createShell(tools: Pick<OrkeonTools, "shellCommand">): Shell {
  return {
    async run(command) {
      const r = await tools.shellCommand({ command, working_directory: WORKING_DIRECTORY });
      return { stdout: shOut(r), stderr: shErr(r), exitCode: shCode(r) };
    },
  };
}
