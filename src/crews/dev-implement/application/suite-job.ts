// The build or the whole suite at the end of a batch, run as a shell job so that no shell timeout
// cuts it: started, looked at every SLICE_SECONDS, up to the suite's limit, then the tail of its log
// (500 lines) written to the batch's log and 15 lines passed on. Where code cannot wait (no node,
// interpreters off), the job cannot start or its first look fails, the suite runs blocking with the same
// limit. A suite past its limit gives no verdict: it is left to the end of the run, which stops it.
//
// The log is what /dev-verify's capture reads (`<work>/<code>/logs/F<n>-build.txt`, `F<n>-test.txt`,
// `F<n>-test-affected.txt`): a `#` header, the output, then a last line `exit=<n>`, the harness's shape.
import type { Files, Shell, ShellJobs } from "../../../shared/application/ports.ts";

export const TAIL_LINES = 500;
export const SHOWN_LINES = 15;

export interface SuiteRequest {
  label: string;
  command: string;
  /** Virtual path of the log this run writes; null: the caller writes the text itself. */
  log: string | null;
  limitSeconds: number;
  sliceSeconds: number;
}

export type SuiteOutcome =
  | { status: "passed" | "failed"; exit: number; tail: string; log: string | null; how: "job" | "blocking"; text: string }
  | { status: "running"; seconds: number; log: string | null; text: string }
  | { status: "not-run"; reason: string };

const reasonOf = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];
const lastLines = (text: string, n: number): string => text.trimEnd().split("\n").slice(-n).join("\n");

/** The log's text: the command and the header lines as comments, the output, then `exit=<n>` when it ended. */
export function logText(command: string, header: readonly string[], output: string, exit: number | null): string {
  const body = output.trimEnd();
  return [`# $ ${command}`, ...header.map((h) => `# ${h}`), ...(body === "" ? [] : [body]), ...(exit === null ? [] : [`exit=${exit}`])].join("\n") + "\n";
}

async function writeLog(files: Pick<Files, "write">, path: string | null, text: string): Promise<string | null> {
  if (path === null) return null;
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
  const header = [`run blocking (${why}): the runtime cuts a result at 32 000 characters`];
  if (r.timedOut === true) {
    const text = logText(req.command, [...header, `still running after ${req.limitSeconds} s: no verdict`], output, null);
    return { status: "running", seconds: req.limitSeconds, log: await writeLog(deps.files, req.log, text), text };
  }
  const text = logText(req.command, header, output, r.exitCode);
  const log = await writeLog(deps.files, req.log, text);
  return { status: r.exitCode === 0 ? "passed" : "failed", exit: r.exitCode, tail: lastLines(output, SHOWN_LINES), log, how: "blocking", text };
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
  for (let looks = 0; ; looks++) {
    let status;
    try {
      status = await deps.jobs.status(job.id);
    } catch (e) {
      // A job never seen running may not run at all: once, the suite runs blocking (the job, if it runs, dies
      // with the run). A job seen before and lost now gives no verdict.
      if (looks === 0) return blocking(deps, req, `job ${job.id} could not be read: ${reasonOf(e)}`);
      return { status: "not-run", reason: `${req.label}: job ${job.id} cannot be read: ${reasonOf(e)}` };
    }
    if (!status.running) {
      let tail = "";
      try {
        tail = await deps.jobs.tail(job.id, TAIL_LINES);
      } catch (e) {
        tail = `(the tail could not be read: ${reasonOf(e)})`;
      }
      const text = logText(req.command, [`job ${job.id}, its whole log at ${job.log} (the run's own); the last ${TAIL_LINES} lines follow`], tail, status.exitCode);
      const log = await writeLog(deps.files, req.log, text);
      return { status: status.exitCode === 0 ? "passed" : "failed", exit: status.exitCode, tail: lastLines(tail, SHOWN_LINES), log, how: "job", text };
    }
    if (seconds >= req.limitSeconds) {
      const text = logText(req.command, [`job ${job.id} still running after ${seconds} s: no verdict; its log at ${job.log}`], "", null);
      return { status: "running", seconds, log: await writeLog(deps.files, req.log, text), text };
    }
    if (!(await deps.jobs.wait(req.sliceSeconds))) {
      return { status: "not-run", reason: `${req.label}: code could no longer wait on job ${job.id}` };
    }
    seconds += req.sliceSeconds;
  }
}
