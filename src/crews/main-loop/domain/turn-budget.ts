// The budget bounds one turn. Its wall time (seconds) is the model's own work: the
// clock stops while a tool call waits for the operator's answer (Orkeon #127; the
// engine's ExecutionTimeout pauses the same way). 30 minutes, the example settings'
// ExecutionTimeout too, bound a long interactive turn. The context tokens count the
// context once (Orkeon #224, #495): each call charges its completion plus the lesser of what its prompt grew
// by and the part the provider's cache did not serve, never the whole context again, so
// a turn of n calls on a context of c tokens spends about c plus its completions. 700k is
// 200 calls of 3 500 (TOKENS_PER_CALL, the growth a tool call adds), the dev steps' rule.
//
// The spawned agents: the runtime allows 3 when a budget names none (Orkeon's AgentExecutionBudget); past the count
// spawn_agent is refused with a tool error and the turn carries on (Orkeon #423; it used to end the whole turn,
// #422). An audit split by area sends four to six explorers, so the main loop allows 8. Each is bounded by its own iterations
// (EXPLORER_CHARTER) and starts with what the turn has left as its ceiling; its calls are not counted against the
// turn's, but the turn's wall clock runs while it works. Pure.

/** What one main-loop turn may spend. */
export const MAIN_LOOP_BUDGET = {
  toolCalls: 200,
  wallTime: 1800,
  contextTokens: 700_000,
  delegationDepth: 2,
  spawnedAgents: 8,
} as const;
