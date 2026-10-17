/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /files [path] — list a directory's entries (SPEC §7 / design 02).
// Backing: directory_read. No new tool/service.
import { rawTokens } from "./_lib/args.ts";
import { orkeonFiles } from "../shared/infrastructure/orkeon/wiring.ts";

const files = orkeonFiles();

defineCommand({
  name: "files",
  description: "List the files in a directory (defaults to /workspace).",
  handler: async (args, ctx) => {
    // VFS needs an absolute virtual path; resolve a relative arg under /workspace.
    const arg = rawTokens(args)[0];
    const path = !arg ? "/workspace" : arg.startsWith("/") ? arg : "/workspace/" + arg;
    const names = await files.list(path, 200);
    if (names.length === 0) return ctx.continue("(empty)");
    ctx.table(names.map((entry) => ({ entry })));
    return ctx.continue();
  },
});
