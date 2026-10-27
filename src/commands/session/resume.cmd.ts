/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /resume — the sessions of this project the launcher kept (/session-history), newest first, then the
// current buffer's last turns; `/resume <number or id>` brings one back in place of this session
// (Orkeon #227). Entry point: wires the files, the session, the clock and the host's session service
// into _lib/session/resume.ts (runResume), which reads them.
import { runResume } from "../_lib/session/resume.ts";
import { rawTokens } from "../_lib/args.ts";
import { showView } from "../_lib/view.ts";
import { orkeonClock, orkeonFiles, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createSessionSwitch } from "../../shared/infrastructure/orkeon/session-switch.ts";

const deps = { files: orkeonFiles(), session: orkeonSessionIo(), clock: orkeonClock() };

defineCommand({
  name: "resume",
  description: "List this project's saved sessions; /resume <number or id> brings one back in place of this session.",
  handler: async (args, ctx) =>
    showView(ctx, await runResume({ ...deps, switch: createSessionSwitch(ctx.services) }, rawTokens(args)[0])),
});
