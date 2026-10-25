// FakeShellJobs: the ShellJobs port. Each started command lands in `started`, its job `j<n>` logging to
// `/output/jobs/j<n>.log`, or `start` throws `startError`. A look at a job (`status`) counts in `looks`: the
// job runs for the first `runningFor` looks, then exits with `exit[<its command>]` (0 by default); from the
// look `lookError.after` on, the look throws `lookError.error` instead. `tail` answers `log`; each wait asked
// for lands in `waits` and answers `canWait`.
import type { ShellJobs, ShellJobStatus } from "../../../src/shared/application/ports.ts";

export class FakeShellJobs implements ShellJobs {
  started: string[] = [];
  exit: Record<string, number> = {};
  startError: Error | null = null;
  runningFor = 0;
  looks = 0;
  lookError: { after: number; error: Error } | null = null;
  log = "all green";
  waits: number[] = [];
  canWait = true;

  async start(command: string): Promise<{ id: string; log: string }> {
    if (this.startError) throw this.startError;
    this.started.push(command);
    const id = `j${this.started.length}`;
    return { id, log: `/output/jobs/${id}.log` };
  }

  async status(id: string): Promise<ShellJobStatus> {
    if (this.lookError !== null && this.looks >= this.lookError.after) throw this.lookError.error;
    this.looks++;
    if (this.looks <= this.runningFor) return { running: true, exitCode: -1 };
    return { running: false, exitCode: this.exit[this.started[Number(id.slice(1)) - 1]] ?? 0 };
  }

  async tail(): Promise<string> {
    return this.log;
  }

  async wait(seconds: number): Promise<boolean> {
    this.waits.push(seconds);
    return this.canWait;
  }
}
