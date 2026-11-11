// The text the agents and crews show the user: a refused launch, the problems of a charter, the answers of
// /tasks about an instance.

// ── Refused launches ────────────────────────────────────────────────────

export const chainLimitReached = (crew: string, of: string, depth: number, limit: number): string =>
  `${crew} not launched: the chain of crews${of} reached its limit (depth ${depth}, limit ${limit}, ` +
  "Orkeon:Cli:ScriptCommands:MaxChainDepth); type the next step yourself.";
export const alreadyRunning = (crew: string, ticket: string | number): string =>
  `${crew} not launched: it is already running (ticket ${ticket}); wait for its result, then type the line again.`;

// ── The problems of a charter ───────────────────────────────────────────

export const charterNameNotKebab = (name: string): string => `charter name '${name}' is not a kebab-case name of 2 to 40 characters`;
export const charterModeCanWrite = (name: string, mode: string): string =>
  `charter ${name}: mode ${mode} can write; a sub-agent runs read-only (plan or dontAsk) for now`;
export const charterToolNotOffered = (name: string, tool: string, mode: string): string =>
  `charter ${name}: ${tool} is not offered in mode ${mode}`;
export const charterNoToolLeft = (name: string): string => `charter ${name}: no tool left once the mode and the disallowed list apply`;
export const charterIterations = (name: string, maxIterations: number): string =>
  `charter ${name}: maxIterations ${maxIterations} is not between 1 and 80`;

// ── /tasks and the agent instances ──────────────────────────────────────

export const RUN_STOPPED_ANSWERING = "its run stopped answering";
export const noAgentInstance = (ref: string): string => `no agent instance '${ref}': /tasks lists them`;
export const namesAnInstanceOf = (ref: string, crews: string, choices: string): string =>
  `'${ref}' names an instance of ${crews}: write ${choices}`;
export const nothingToStop = (label: string, state: string): string => `${label} is ${state}: there is nothing to stop`;
export const runNoLongerAnswers = (label: string): string => `${label}: its run no longer answers; it ends with the run`;
export const sendRefusedWhileRunning = (label: string, id: string): string =>
  `${label} is running: a send is refused until it ends (/tasks stop ${id} ends it)`;
export const RUNNING_STOP_ASKED = "running (stop asked)";
export const RUNNING_NOT_ANSWERING = "running, not answering";
export const RUNNING_NO_LONGER_ANSWERING = "running, no longer answering";
export const runOfStarted = (crew: string, startedAt: string, state: string): string => `run of ${crew} started ${startedAt}: ${state}`;
export const ladderNeedsTwo = (value: string): string =>
  `'${value}' is no ladder: name at least two profiles of the host, cheapest first, separated by commas (small,large)`;
export const ladderRepeats = (value: string): string => `'${value}' names a profile twice`;
