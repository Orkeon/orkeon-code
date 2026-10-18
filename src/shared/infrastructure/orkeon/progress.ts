// Progress adapter: the host progress channel (the `progress_report` tool →
// ProgressBroker → TUI status-line bar; also stamped on the owning command
// instance for ps/inspect and the agents pane).
//
// Best-effort BY CONTRACT: progress is decoration, and no long operation may
// fail because the host it runs on (an older orkeon-repl, a bare test harness)
// does not expose the tool. Every call degrades to a silent no-op.

import type { Progress } from "../../application/ports.ts";
import type { ProgressReportInput } from "./runtime-tools.ts";

/** `progressReport` is optional: the host may not register it. */
export function createProgress(tools: Partial<Pick<OrkeonTools, "progressReport">>): Progress {
  const send = async (input: ProgressReportInput): Promise<void> => {
    try {
      if (typeof tools.progressReport !== "function") return;
      await tools.progressReport(input);
    } catch { /* progress is decoration — never fail the operation for it */ }
  };
  return {
    report: (spec) => send(spec),
    done: (label) => send({ label, done: true }),
  };
}
