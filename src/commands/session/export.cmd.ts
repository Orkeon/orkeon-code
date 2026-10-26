/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /export [path] — export the session: conversation, typed memory and cost
// (baseline 04 §/export: "conversation history, typed memory entries, and
// cost/token usage").
//
// B-11 deepening: the pre-B-11 export wrote the conversation ALONE — the one part
// already recoverable from the live session. The memory and the cost are what an
// export exists to preserve: memory outlives compaction, and the cost cannot be
// reconstructed after the process ends.
import {
  orkeonFiles, orkeonMemoryStore, orkeonSessionIo, orkeonTelemetry,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { rawTokens } from "../_lib/args.ts";
import { runExport } from "../_lib/session/export.ts";
import { showView } from "../_lib/view.ts";

const deps = {
  session: orkeonSessionIo(),
  telemetry: orkeonTelemetry(),
  memory: orkeonMemoryStore(),
  files: orkeonFiles(),
};

defineCommand({
  name: "export",
  description: "Export the session (conversation + memory + cost) to a markdown file.",
  handler: async (args, ctx) => showView(ctx, await runExport(rawTokens(args), deps)),
});
