// The text the project commands show the user (ADR 0026): /debug-tool-call.

export const toolCatalogue = (names: readonly string[]): string =>
  `${names.length} registered tools:\n${names.join(", ")}\n` +
  "usage: /debug-tool-call <tool_name> [{\"arg\": \"value\"}]\n" +
  "(argument schemas are not exposed to script-land — # TBD_tool_schema)";
export const noRegisteredToolSeeList = (tool: string): string =>
  `no registered tool '${tool}'. /debug-tool-call list shows what this host has.`;
