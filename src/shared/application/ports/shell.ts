// The shell ports: one command run to its end, and the commands run detached as jobs.
// Types only, re-exported by ../ports.ts.

/** The outcome of one shell command. */
export interface ShellResult {
  stdout: string;
  stderr: string;
  /** -1 when the runtime reported none. */
  exitCode: number;
  /** True when the runtime stopped the command at its timeout; absent otherwise. */
  timedOut?: boolean;
  /** Set when the runtime cut stdout (its head and its tail kept around the runtime's marker); absent when whole. */
  stdoutCut?: StreamCut;
  /** Set when the runtime cut stderr, as `stdoutCut`. */
  stderrCut?: StreamCut;
}

/** What the runtime says of a stream it cut. */
export interface StreamCut {
  /** The whole stream's length, as the runtime counts it (characters; bytes for a middle it could not keep). */
  totalChars: number;
  /** The virtual file the runtime wrote the output to; absent when it kept none. */
  outputPath?: string;
}

/** How one command runs. */
export interface ShellOptions {
  /** Whole seconds before the runtime stops the command; the runtime's default when absent. */
  timeoutSeconds?: number;
}

/** Runs shell commands in the project's working directory, /workspace. A command
 *  the runtime refuses or cannot run throws; a failing one returns its exit code. */
export interface Shell {
  run(command: string, options?: ShellOptions): Promise<ShellResult>;
}

/** Where a detached job stands: running, or exited with its code (-1 when it ended without one). */
export interface ShellJobStatus { running: boolean; exitCode: number }

/** Commands run detached (the runtime's shell jobs): a long suite outlives no shell timeout, its whole
 *  output goes to a log file, and the caller reads its tail. A job belongs to the running crew and is
 *  stopped when the crew's run ends. A call the runtime refuses throws. */
export interface ShellJobs {
  /** Starts `command` in /workspace; its id and the virtual path of its log. */
  start(command: string): Promise<{ id: string; log: string }>;
  status(id: string): Promise<ShellJobStatus>;
  /** The last `lines` lines of the job's log (500 at most). */
  tail(id: string, lines: number): Promise<string>;
  /** Waits about `seconds` (code has no timer of its own); false when it cannot wait here. */
  wait(seconds: number): Promise<boolean>;
}
