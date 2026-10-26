// FakeShell: the Shell port scripted per command line. A command answers
// `results[<command line>]` over an empty, successful default, or throws
// `errors[<command line>]`, as a command the runtime refuses does; every command
// run lands in `commands`, in order, and in `calls` with the options it carried.
// A timeout is scripted as `results[cmd] = { timedOut: true, exitCode: -1 }`, and
// the timeout asked for is read from `calls[i].options`. `answer`, when set, is
// asked of every command and what it gives is laid over that answer, as a world
// whose state a command reads (a tree, a test run) answers.
import type { Shell, ShellOptions, ShellResult } from "../../../src/shared/application/ports.ts";

export class FakeShell implements Shell {
  results: Record<string, Partial<ShellResult>> = {};
  errors: Record<string, Error> = {};
  commands: string[] = [];
  /** Every call with the options it carried (absent when none), in order. */
  calls: Array<{ command: string; options?: ShellOptions }> = [];
  answer: ((command: string) => Partial<ShellResult> | undefined) | null = null;

  async run(command: string, options?: ShellOptions): Promise<ShellResult> {
    this.commands.push(command);
    this.calls.push(options === undefined ? { command } : { command, options });
    const error = this.errors[command];
    if (error) throw error;
    return { stdout: "", stderr: "", exitCode: 0, ...this.results[command], ...this.answer?.(command) };
  }
}
