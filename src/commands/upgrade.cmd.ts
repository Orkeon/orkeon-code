/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /upgrade: report the version and how to update. There is no self-update
// channel: Orkeon Code updates with its checkout, the runtime with .orkeon-version.
import { CLI_NAME, CLI_VERSION, CLI_BUILD } from "./_lib/meta.ts";

defineCommand({
  name: "upgrade",
  description: "Show the current version and how the runtime is pinned (no self-update channel).",
  handler: async (_args, ctx) => ctx.continue(
    `${CLI_NAME} ${CLI_VERSION} (${CLI_BUILD})\n` +
    "No self-update channel. Orkeon Code updates with its checkout (git pull, or a newer release " +
    "archive); the Orkeon runtime it runs on is pinned by .orkeon-version. Update, then relaunch.",
  ),
});
