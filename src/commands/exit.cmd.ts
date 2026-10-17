/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /exit (E-1) — leave the REPL. Same behavior as the built-in default exit
// (shadowing it is harmless); present as a scripted command for name-level
// parity with the original's command surface.
defineCommand({
  name: "exit",
  description: "Exit the coding-agent REPL.",
  handler: async (_args, ctx) => ctx.exit("bye."),
});
