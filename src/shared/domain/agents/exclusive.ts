// An exclusive crew launch (`runCrewAsync(name, input, { exclusive: true })`, Orkeon #239): the runtime refuses
// a crew whose previous exclusive launch is not terminal, before any LLM call, with a plain JS error naming the
// running instance, `crew '<name>' already running (ticket <t>)`. The check and the registration are one step on
// the host, so two lines typed in the same tick cannot both pass; the crew is free again as soon as that instance
// completes, fails or is cancelled. A command reads the crew and the ticket off the refusal through
// exclusiveRefusal and shows exclusiveLine, rather than failing on an unexplained throw. Pure.

const REFUSAL = /crew '([^']+)' already running \(ticket ([^\s)]+)\)/i;

/** What an exclusive refusal says: the crew that runs and the ticket of its instance. */
export interface ExclusiveRefusal { crew: string; ticket: string }

/** The crew and the ticket of an exclusive refusal; null for any other failure. */
export function exclusiveRefusal(error: unknown): ExclusiveRefusal | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
  const m = REFUSAL.exec(message);
  return m === null ? null : { crew: m[1], ticket: m[2] };
}

/** The line a command shows for a crew refused because it already runs. */
export function exclusiveLine(refusal: ExclusiveRefusal): string {
  return `${refusal.crew} not launched: it is already running (ticket ${refusal.ticket}); wait for its result, then type the line again.`;
}
