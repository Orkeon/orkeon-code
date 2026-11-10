// The text the shared helpers of commands/_lib/ show the user (ADR 0026): the warnings of a launch, the refusals of a
// dev step. Read by dispatch.ts, dev-step.ts and args.ts.

// dispatch.ts: the main loop's launch
export const extraToolMissing = (name: string) =>
  `extra tool '${name}' is not registered by the host and is left out ` +
  "(its MCP server did not connect, its plugin did not load, or the name is mistyped)";
export const extraToolIgnored = (key: string, entry: string, rule: string) => `${key}: '${entry}' is ignored (${rule})`;
export const extraToolsUnreadable = (key: string, reason: string) =>
  `${key} could not be read (${reason}): no extra tool this turn`;
export const ruleOverridden = (rule: string) =>
  `permission rule '${rule}' is left out of the gate: a built-in rule denies the same calls (the shared memory's candidates and entries, the user configuration, paths.deny)`;
export const ruleDormant = (rule: string, key: string) =>
  `permission rule '${rule}' is dormant: ${key} does not list its tool, the gate does not get it`;
export const invalidPermissionEntries = (count: number) =>
  `${count} stored permission entr(ies) are not rules and were ignored`;
export const NO_SESSION_RULES = "the host keeps no session rules: the gate decides each call from the mode alone";
export const voiceReplyUnreadable = (key: string, reason: string) =>
  `${key} could not be read (${reason}): the answer is not read aloud this turn`;
export const voiceReplyNoSpeakTool = (key: string, tool: string) =>
  `${key} is on but the host registers no '${tool}': the answer is not read aloud ` +
  "(start orkeon-code with ORKEON_CODE_AUDIO_DIR and ORKEON_CODE_VOICE=1)";

// dev-step.ts: the start of a dev step
export const stepRulesNotInGate = (command: string) =>
  `warning: the host keeps no session rules: /${command}'s rule sets are not in the host's gate, the crew's callback alone checks them.`;
export const sessionRuleLeftOut = (rule: string, command: string) =>
  `warning: the session's rule '${rule}' is left out of the gate during /${command}: the step denies the same calls.`;
export const modeUnreadableRefusal = (command: string, writes: string) =>
  `✗ refused: the session mode could not be read, and /${command} ${writes}: run it again`;
export const modeUnknownRefusal = (mode: string, command: string, writes: string) =>
  `✗ refused: the session mode ${mode} is not one Orkeon Code knows, and /${command} ${writes}: /mode default, then run it again`;
export const modeReadOnlyRefusal = (mode: string, command: string, writes: string) =>
  `✗ refused: the session mode ${mode} is read-only, and /${command} ${writes}: /mode default, then run it again`;
export const batchNotRecorded = (reason: string) =>
  `warning: the batch in progress could not be recorded (${reason}): a compaction will write no state file for it.`;

// args.ts: /debug-tool-call
export const DEBUG_TOOL_CALL_USAGE = "usage: /debug-tool-call <tool_name> [{\"arg\": \"value\"}]";
export const notAToolName = (tool: string) => `'${tool}' is not a tool name (expected snake_case, e.g. file_read)`;
export const argumentsNotJson = (reason: string, payload: string) =>
  `arguments are not valid JSON (${reason}): ${payload}`;
export const argumentsNotObject = (got: string) => `arguments must be a JSON OBJECT, got ${got}`;
