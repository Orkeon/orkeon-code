/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /skills — attach or detach workspace markdown playbooks, registered by path in
// the session state bag (baseline 04 §/skills). Entry point: wires the session
// and the files into _lib/skills.ts (runSkills), which holds the sub-commands.
import { rawTokens } from "../_lib/args.ts";
import { runSkills } from "../_lib/skills.ts";
import { showView } from "../_lib/view.ts";
import { orkeonFiles, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();
const files = orkeonFiles();

defineCommand({
  name: "skills",
  description: "List, attach or detach skill files (workspace markdown playbooks).",
  handler: async (args, ctx) => showView(ctx, await runSkills(rawTokens(args), { session, files })),
});
