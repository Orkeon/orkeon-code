/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /debug-tool-call (B-12) — invoke a registered tool by name with JSON arguments
// and print the RAW result (baseline 04 §/debug-tool-call).
//
// Two halves in the baseline, and only one is reachable:
//
//   invocation  ✅ `tools.<camelCase>(args)` — the bridge exposes every registered
//               IBaseTool, so any of them can be driven from here.
//   schema      ❌ `# TBD_tool_schema` — ToolsNamespaceBinding exposes each tool as
//               a bare function; `IBaseTool.Schema` (name, description, parameter
//               table) never crosses into script-land through it, which is why
//               this command lists the registered names (read from the `tools`
//               service) and cannot describe an argument. Framework gap, recorded
//               rather than papered over with a hand-maintained copy of the table
//               that would drift the day a tool gains a parameter.
//
// The raw result is printed verbatim: the point of this command is to see what the
// tool actually returned, so shaping the output would remove its only value.
import { rawTokens, parseToolCallArgs } from "./_lib/args.ts";
import { orkeonToolCatalogue } from "../shared/infrastructure/orkeon/wiring.ts";

defineCommand({
  name: "debug-tool-call",
  description: "Invoke a registered tool with JSON arguments and print its raw result.",
  handler: async (args, ctx) => {
    const tokens = rawTokens(args);
    const catalogue = orkeonToolCatalogue(ctx.services);

    // No argument: the catalogue. It is the only inspection this surface can offer
    // until the schema crosses the bridge.
    if (tokens.length === 0 || tokens[0] === "list") {
      const names = catalogue.names();
      return ctx.continue(
        `${names.length} registered tools:\n${names.join(", ")}\n` +
        "usage: /debug-tool-call <tool_name> [{\"arg\": \"value\"}]\n" +
        "(argument schemas are not exposed to script-land — # TBD_tool_schema)",
      );
    }

    const parsed = parseToolCallArgs(tokens);
    if (!parsed.ok) return ctx.continue(parsed.reason);

    // Orkeon finds a tool case-insensitively: the call and its header use the registered name.
    const tool = catalogue.find(parsed.tool);
    if (tool === undefined) {
      return ctx.continue(
        `no registered tool '${parsed.tool}'. /debug-tool-call list shows what this host has.`,
      );
    }

    const started = Date.now();
    try {
      const result = await catalogue.call(tool, parsed.args);
      ctx.writeLine(`── ${tool} ← ${JSON.stringify(parsed.args)} (${Date.now() - started} ms)`);
      // JSON.stringify, not a table: a tool result is an arbitrary shape and this
      // command is here to show it as it is, nesting and casing included.
      ctx.writeLine(JSON.stringify(result, null, 2));
      return ctx.continue();
    } catch (e: any) {
      // A tool failure is a RESULT here, not a command error: reproducing a failing
      // call is exactly what one debugs with. The message carries the tool's own
      // wording (ToolsNamespaceBinding throws with the tool name and arguments).
      return ctx.continue(`── ${tool} FAILED after ${Date.now() - started} ms:\n${String(e?.message ?? e)}`);
    }
  },
});
