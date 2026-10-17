// FakeShell: the Shell port scripted per command line. A command answers
// `results[<command line>]` over an empty, successful default, or throws
// `errors[<command line>]`, as a command the runtime refuses does; every command
// run lands in `commands`, in order.
import type { Shell, ShellResult } from "../../src/shared/application/ports.ts";

export class FakeShell implements Shell {
  results: Record<string, Partial<ShellResult>> = {};
  errors: Record<string, Error> = {};
  commands: string[] = [];

  async run(command: string): Promise<ShellResult> {
    this.commands.push(command);
    const error = this.errors[command];
    if (error) throw error;
    return { stdout: "", stderr: "", exitCode: 0, ...this.results[command] };
  }
}
