/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /dev-status — where a piece of dev work stands: the work folder, the pack, and per batch the
// plan state, the TDD ticks and the last verdict. Read-only. Entry point: wires the files, the
// shell and the config store into _lib/dev.ts (runDevStatus).
import { rawTokens } from "../_lib/args.ts";
import { runDevStatus } from "../_lib/dev.ts";
import { showView } from "../_lib/view.ts";
import { orkeonConfigStore, orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { files: orkeonFiles(), shell: orkeonShell(), config: orkeonConfigStore() };

defineCommand({
  name: "dev-status",
  description: "Show where a piece of dev work stands: batches, TDD ticks and last verdict (read-only).",
  handler: async (args, ctx) => showView(ctx, await runDevStatus(rawTokens(args), deps)),
});
