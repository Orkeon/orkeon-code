// The messages of shared/domain/agent-policy: the text the user reads (ADR 0026).

// ── Permission rules ────────────────────────────────────────────────────

/** Why an allow rule does nothing in plan, or in a mode that does not offer its tool. */
export const PLAN_IGNORES_ALLOW_RULES =
  "mode 'plan' ignores every allow rule: the gate decides each call from the mode, which runs reads " +
  "and refuses the rest. Switch mode instead.";
export const modeDoesNotOffer = (mode: string, tool: string): string =>
  `mode '${mode}' does not offer '${tool}': an allow rule spares a question, ` +
  "it does not hand a tool over. Switch mode instead.";

/** What a rule to add is refused or warned for. */
export const noToolARuleMayName = (tool: string, tools: string): string =>
  `'${tool}' is no tool a rule may name: one of ${tools}`;
export const offeredToEveryAct = (tool: string): string =>
  `'${tool}' is offered to every act whatever the mode: an allow rule lets it run without asking in ` +
  "dontAsk too.";
export const argumentsNotKnown = (tool: string, argument: string): string =>
  `the arguments of '${tool}' are not known here (its MCP server or plugin declares them): the rule ` +
  `matches a call only if '${tool}' takes an argument named exactly '${argument}'.`;
export const takesNoArgument = (tool: string): string => `'${tool}' takes no argument: a rule on it covers every call`;
export const hasNoArgument = (tool: string, argument: string, known: readonly string[]): string =>
  `'${tool}' has no argument '${argument}': it takes ${known.join(", ")}`;

// ── Behaviour flags, extra tools ────────────────────────────────────────

export const effortFlag = (effort: string, maxIterations: number, thinking: string): string =>
  `effort=${effort} (act maxIterations=${maxIterations}, provider thinking ${thinking})`;

/** What an entry must be, for messages. */
export const EXTRA_TOOL_ENTRY_RULE = "each entry is <name>[:read|:write], a tool that is not built in, named once";
export const NAMES_NO_TOOL = "it names no tool";

// ── Path rules ──────────────────────────────────────────────────────────

/** What an entry must be, for messages. */
export const PATH_ENTRY_RULE =
  "entries separated by commas, each a path of a mount in any spelling or a path under /workspace, `*` for any run of characters";
export const underNoMount = (given: string): string => `'${given}' is under no mount of this host: no rule`;
export const namesEveryPathNoRule = (given: string): string => `'${given}' names every path: no rule`;
export const holdsAQuote = (entry: string, rule: string): string =>
  `'${entry}' holds a quote: write the path bare, its spaces included (${rule})`;
export const namesEveryPath = (entry: string, rule: string): string => `'${entry}' names every path (${rule})`;
export const outsideUserList = (key: string, entry: string): string =>
  `${key} (project): '${entry}' is outside the user's list; a project file may only narrow it`;
export const refusedOwnMount = (tool: string, path: string, mount: string): string =>
  `${tool} on ${path} is refused: ${mount} is Orkeon Code's own`;
export const refusedByDeny = (tool: string, path: string, key: string, deny: string): string =>
  `${tool} on ${path} is refused by ${key} '${deny}'`;
export const outsideAllow = (tool: string, path: string, key: string): string => `${tool} on ${path} is outside ${key}`;

// ── Rule sets ───────────────────────────────────────────────────────────

export const GIT_READONLY_TITLE = "git commands that change the repository, its branches or its remotes";
export const INLINE_INTERPRETERS_TITLE = "code handed inline to an interpreter, which could run what the other rules refuse";
export const READ_NOISE_TITLE = "reads under build outputs, version-control internals and installed packages";
export const SECRETS_TITLE = "a private key block or a token with a known prefix in written content";
export const STATE_FILES_TITLE = "files only Orkeon Code's own code writes";
export const rootWholeProject = (raw: string): string => `root '${raw}' names the whole project: no rule`;
export const rootOutside = (raw: string, workspace: string): string => `root '${raw}' is outside ${workspace}: no rule`;
export const rootClimbsOut = (raw: string): string => `root '${raw}' climbs out with '..': no rule`;
export const rootHoldsStar = (raw: string): string => `root '${raw}' holds '*': a rule on it would cover more than the folder`;
export const patternWholeProject = (raw: string): string => `pattern '${raw}' covers the whole project: no rule`;
export const patternOutside = (raw: string, workspace: string): string => `pattern '${raw}' is outside ${workspace}: no rule`;
export const patternClimbsOut = (raw: string): string => `pattern '${raw}' climbs out with '..': no rule`;
