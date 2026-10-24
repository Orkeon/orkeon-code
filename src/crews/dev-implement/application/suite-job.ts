// The build or the whole suite at the end of a batch, run as a shell job so that no shell timeout
// cuts it: started, looked at every SLICE_SECONDS, up to the suite's limit, then the tail of its log
// (500 lines) written to the batch's log and 15 lines passed on. Where code cannot wait (no node,
// interpreters off) or the job cannot start, the suite runs blocking with the same limit. A suite
// past its limit gives no verdict: it is left to the end of the run, which stops it.
import type { Files, Shell, ShellJobs } from "../../../shared/application/ports.ts";

export const TAIL_LINES = 500;
export const SHOWN_LINES = 15;

export interface SuiteRequest {
  label: string;
  command: string;
  /** Virtual path of the log this run writes. */
  log: string;
  limitSeconds: number;
  sliceSeconds: number;
}

export type SuiteOutcome =
  | { status: "passed" | "failed"; exit: number; tail: string; log: string | null; how: "job" | "blocking" }
  | { status: "running"; seconds: number; log: string | null }
  | { status: "not-run"; reason: string };

const reasonOf = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];
const lastLines = (text: string, n: number): string => text.trimEnd().split("\n").slice(-n).join("\n");

async function writeLog(files: Pick<Files, "write">, path: string, text: string): Promise<string | null> {
  try {
    await files.write(path, text);
    return path;
  } catch {
    return null;
  }
}

async function blocking(deps: { shell: Pick<Shell, "run">; files: Pick<Files, "write"> }, req: SuiteRequest, why: string): Promise<SuiteOutcome> {
  let r;
  try {
    r = await deps.shell.run(req.command, { timeoutSeconds: req.limitSeconds });
  } catch (e) {
    return { status: "not-run", reason: `${req.label}: ${reasonOf(e)}` };
  }
  const output = [r.stdout.trimEnd(), r.stderr.trimEnd()].filter((t) => t !== "").join("\n");
  const header = `$ ${req.command}\n# run blocking (${why}): the runtime cuts a result at 32 000 characters\n`;
  const log = await writeLog(deps.files, req.log, `${header}exit ${r.exitCode}\n${output}\n`);
  if (r.timedOut === true) return { status: "running", seconds: req.limitSeconds, log };
  return { status: r.exitCode === 0 ? "passed" : "failed", exit: r.exitCode, tail: lastLines(output, SHOWN_LINES), log, how: "blocking" };
}

export async function runSuite(
  deps: { jobs: ShellJobs; shell: Pick<Shell, "run">; files: Pick<Files, "write"> }, req: SuiteRequest,
): Promise<SuiteOutcome> {
  if (!(await deps.jobs.wait(1))) return blocking(deps, req, "code cannot wait here");
  let job;
  try {
    job = await deps.jobs.start(req.command);
  } catch (e) {
    return blocking(deps, req, `the job did not start: ${reasonOf(e)}`);
  }
  let seconds = 0;
  for (;;) {
    let status;
    try {
      status = await deps.jobs.status(job.id);
    } catch (e) {
      return { status: "not-run", reason: `${req.label}: job ${job.id} cannot be read: ${reasonOf(e)}` };
    }
    if (!status.running) {
      let tail = "";
      try {
        tail = await deps.jobs.tail(job.id, TAIL_LINES);
      } catch (e) {
        tail = `(the tail could not be read: ${reasonOf(e)})`;
      }
      const header = `$ ${req.command}\n# job ${job.id}, its whole log at ${job.log}; the last ${TAIL_LINES} lines follow\nexit ${status.exitCode}\n`;
      const log = await writeLog(deps.files, req.log, `${header}${tail.trimEnd()}\n`);
      return { status: status.exitCode === 0 ? "passed" : "failed", exit: status.exitCode, tail: lastLines(tail, SHOWN_LINES), log, how: "job" };
    }
    if (seconds >= req.limitSeconds) {
      return { status: "running", seconds, log: await writeLog(deps.files, req.log, `$ ${req.command}\n# job ${job.id} still running after ${seconds} s; its log at ${job.log}\n`) };
    }
    if (!(await deps.jobs.wait(req.sliceSeconds))) {
      return { status: "not-run", reason: `${req.label}: code could no longer wait on job ${job.id}` };
    }
    seconds += req.sliceSeconds;
  }
}
