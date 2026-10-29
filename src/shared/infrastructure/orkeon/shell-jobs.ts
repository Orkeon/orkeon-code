// ShellJobs adapter: shell_command's job actions (start_job, job_status, job_tail),
// pinned to /workspace like the Shell adapter. The runtime's schema asks for
// `command` on every action: it is always passed (the command itself to start a job,
// an empty one to read it). A job lives in the running crew's agent run and is
// stopped when that run ends; a call the runtime refuses throws.
//
// The script host has no timer: `wait` runs a small node script that sleeps the
// given seconds (`.orkeon/dev/bin/wait.mjs`, written at the first wait). Without
// node or interpreters, that run fails once and every later wait says false at once,
// so the caller falls back to a blocking run.
//
// Given a batch's working root, the jobs run there, as the Shell adapter's commands do.

import type { ShellJobs } from "../../application/ports.ts";
import { textFromRoot, textToRoot } from "../../domain/dev/path-rebase.ts";
import { pick, shCode } from "./tool-results.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

/** The waiting script, relative to /workspace, and its virtual path. */
export const WAIT_SCRIPT = ".orkeon/dev/bin/wait.mjs";
const WAIT_SCRIPT_CONTENT =
  "// Written by Orkeon Code's dev-implement crew: sleeps argv[2] seconds (the script host has no timer).\n" +
  "const seconds = Number(process.argv[2]);\n" +
  "setTimeout(() => {}, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0);\n";
/** job_tail's own ceiling. */
const MAX_TAIL_LINES = 500;

export function createShellJobs(tools: Pick<OrkeonTools, "shellCommand" | "fileWrite">, root?: string): ShellJobs {
  const cwd = root ?? WORKSPACE;
  let waiter: "unknown" | "ready" | "absent" = "unknown";
  return {
    async start(command) {
      if (command.trim() === "") throw new Error("a shell job needs a command");
      const r = await tools.shellCommand({ action: "start_job", command: textToRoot(command, root), working_directory: cwd });
      const id = String(pick(r, "job_id", "jobId", "JobId") ?? "");
      if (id === "") throw new Error(`start_job answered no job id for: ${command}`);
      return { id, log: String(pick(r, "output_path", "outputPath", "OutputPath") ?? "") };
    },
    async status(id) {
      const r = await tools.shellCommand({ action: "job_status", command: "", job_id: id, working_directory: cwd });
      const status = String(pick(r, "status", "Status") ?? "");
      return { running: status === "running", exitCode: status === "running" ? -1 : shCode(r) };
    },
    async tail(id, lines) {
      const count = Math.max(1, Math.min(MAX_TAIL_LINES, Math.floor(lines)));
      const r = await tools.shellCommand({
        action: "job_tail", command: "", job_id: id, tail_lines: count, working_directory: cwd,
      });
      return textFromRoot(String(pick(r, "tail", "Tail") ?? ""), root);
    },
    async wait(seconds) {
      if (!(Number.isInteger(seconds) && seconds >= 1)) {
        throw new Error(`a wait is a whole number of seconds, at least 1: ${seconds}`);
      }
      if (waiter === "absent") return false;
      try {
        if (waiter === "unknown") {
          await tools.fileWrite({ path: `${cwd}/${WAIT_SCRIPT}`, content: WAIT_SCRIPT_CONTENT });
        }
        const r = await tools.shellCommand({
          command: `node ${WAIT_SCRIPT} ${seconds}`, working_directory: cwd, timeout_seconds: seconds + 30,
        });
        if (shCode(r) !== 0) {
          waiter = "absent";
          return false;
        }
        waiter = "ready";
        return true;
      } catch {
        waiter = "absent";
        return false;
      }
    },
  };
}
