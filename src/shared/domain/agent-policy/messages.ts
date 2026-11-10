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
