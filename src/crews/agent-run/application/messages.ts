// The text the operator reads from the agent-run crew.

/** The error of a charter the catalogue does not hold. */
export function unknownCharter(name: string, known: string): string {
  return `agent-run: unknown charter '${name}' (known: ${known})`;
}

export const EMPTY_BRIEF = "agent-run: the brief is empty";

/** The error of a brief over the size a charter takes. */
export function agentRunBriefTooLong(length: number, max: number): string {
  return `agent-run: the brief is ${length} characters, over ${max}`;
}

/** The log line of a charter about to run. */
export function charterRunning(name: string, mode: string): string {
  return `agent-run: ${name} in ${mode}, a new run (no context of the instance it repairs)`;
}
