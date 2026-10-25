// The working root and the shell_command replies the createShellJobs tests run under.
import { FakeTools } from "../../../../tests/support/fake-tools.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const ROOT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

/** FakeTools whose shell_command answers a tail naming a file under ROOT, and any other action a running job j1. */
export function rootedTools(): FakeTools {
  const tools = new FakeTools();
  tools.replies.shellCommand = (input: { action?: string }) =>
    input.action === "job_tail" ? { tail: `${ROOT}/src/a.ts failed` } : { job_id: "j1", output_path: "/output/jobs/j1.log", status: "running", exit_code: 0 };
  return tools;
}

/** The working directories of the shell_command calls `tools` received. */
export function workingDirectories(tools: FakeTools): string[] {
  return (tools.inputsOf("shellCommand") as Array<{ working_directory: string }>).map((i) => i.working_directory);
}
