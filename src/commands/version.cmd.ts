/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /version — show the CLI version (SPEC §7 / design 02). Static; no tool/service.
import { CLI_NAME, CLI_VERSION, CLI_BUILD } from "./_lib/meta.ts";

defineCommand({
  name: "version",
  description: "Show the Orkeon coding-agent CLI version.",
  handler: async (_args, ctx) => ctx.continue(`${CLI_NAME} ${CLI_VERSION} (${CLI_BUILD})`),
});
