// A chain of crews launched from `completed` handlers (`runCrewAsync` from a `completed`): the runtime
// counts each hop and refuses the one past `Orkeon:Cli:ScriptCommands:MaxChainDepth` (default 8, the
// first crew counted, V-A5) with a plain JS error, `chain depth <d> reached (MaxChainDepth <l>, /<command>)`,
// the command whose launch was refused last (`ChainDepthExceededException`, Orkeon #221). A driver reads the
// depth, the limit and the command off the refusal through chainDepthRefusal, rather than failing on an
// unexplained throw: the limit the host is configured with, never a default copied here. A driver that
// relaunches its own work passes `{ chain: "continue" }` to the launch (CrewLaunchOptions) and never meets
// the refusal. Pure.

const REFUSAL = /chain depth (\d+) reached \(MaxChainDepth (\d+)(?:, \/([^\s)]+))?\)/i;

/** What a chain refusal says: the depth reached, the limit, and the command refused when the message names it. */
export interface ChainDepthRefusal { depth: number; limit: number; command?: string }

/** The depth and limit of a chain refusal; null for any other failure. */
export function chainDepthRefusal(error: unknown): ChainDepthRefusal | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
  const m = REFUSAL.exec(message);
  if (m === null) return null;
  return m[3] === undefined
    ? { depth: Number(m[1]), limit: Number(m[2]) }
    : { depth: Number(m[1]), limit: Number(m[2]), command: m[3] };
}

/** The line a command shows for a refused hop. */
export function chainDepthLine(crew: string, refusal: ChainDepthRefusal): string {
  const of = refusal.command === undefined ? "" : ` of /${refusal.command}`;
  return `${crew} not launched: the chain of crews${of} reached its limit (depth ${refusal.depth}, limit ${refusal.limit}, ` +
    "Orkeon:Cli:ScriptCommands:MaxChainDepth); type the next step yourself.";
}
