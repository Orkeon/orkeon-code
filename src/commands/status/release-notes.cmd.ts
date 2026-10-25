/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /release-notes — show what's in this build (SPEC §7 / design 02). Static; no tool/service.
import { RELEASE_NOTES } from "../_lib/meta.ts";

defineCommand({
  name: "release-notes",
  description: "Show the release notes for this build.",
  handler: async (_args, ctx) => ctx.continue(RELEASE_NOTES),
});
