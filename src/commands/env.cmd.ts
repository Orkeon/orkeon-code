/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /env — show environment info (OS + node) (SPEC §7 / design 02).
// Backing: shell_command. No new tool/service.
import { orkeonShell } from "../shared/infrastructure/orkeon/wiring.ts";

const shell = orkeonShell();

defineCommand({
  name: "env",
  description: "Show environment information: OS, kernel, and node version.",
  handler: async (_args, ctx) => {
    // Single allowlisted command (node), no shell operators — the shell tool
    // forbids '&&' and only allowlists git/dotnet/npm/node/ls/cat/echo.
    const r = await shell.run("node -p \"[process.platform, process.arch, 'node ' + process.version].join('  ')\"");
    ctx.writeLine(r.stdout.trim() || "(unavailable)");
    return ctx.continue();
  },
});
