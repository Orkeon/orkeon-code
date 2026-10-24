// A chain of crews launched from `completed` handlers (`runCrewAsync` from a `completed`): the runtime
// counts each hop and refuses the one past `Orkeon:Cli:ScriptCommands:MaxChainDepth` (default 8, the
// first crew counted, V-A5) with a plain JS error, `Async command chain refused at depth <d>, limit <l>.`
// (`ChainDepthExceededException`, `ScriptHostFacade.cs:174-178`). A driver reads the depth and the limit off
// the refusal through chainDepthRefusal, rather than failing on an unexplained throw: the limit the host is
// configured with, never a default copied here. Pure.

const REFUSAL = /chain refused at depth (\d+), limit (\d+)/i;

/** The depth and limit of a chain refusal; null for any other failure. */
export function chainDepthRefusal(error: unknown): { depth: number; limit: number } | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
  const m = REFUSAL.exec(message);
  return m ? { depth: Number(m[1]), limit: Number(m[2]) } : null;
}

/** The line a command shows for a refused hop. */
export function chainDepthLine(crew: string, refusal: { depth: number; limit: number }): string {
  return `${crew} not launched: the chain of crews reached its limit (depth ${refusal.depth}, limit ${refusal.limit}, ` +
    "Orkeon:Cli:ScriptCommands:MaxChainDepth); type the next step yourself.";
}
