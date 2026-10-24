/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /resume — the sessions of this project the launcher kept (/session-history), newest
// first, and the restart that brings one back (`orkeon-code --resume <id>`), then the
// current buffer's last turns. Entry point: wires the files and the session into
// _lib/resume.ts (runResume), which reads them.
import { runResume } from "./_lib/resume.ts";
import { showView } from "./_lib/view.ts";
import { orkeonFiles, orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { files: orkeonFiles(), session: orkeonSessionIo() };

defineCommand({
  name: "resume",
  description: "List this project's saved sessions; quit, then orkeon-code --resume <id> brings one back.",
  handler: async (_args, ctx) => showView(ctx, await runResume(deps)),
});
