/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /onboarding (E-1) — first-run orientation (baseline 04 §/onboarding). Static.
import { CLI_NAME, CLI_VERSION } from "./_lib/meta.ts";

const ONBOARDING = [
  `Welcome to ${CLI_NAME} ${CLI_VERSION} — a coding agent on the Orkeon scripted stack.`,
  "",
  "Getting started:",
  "  /init                     analyse the workspace and generate CLAUDE.md",
  "  /assistant <request>      ask the agent to explore or change code",
  "  mode: prefixes            plan: | acceptEdits: | bypassPermissions: | dontAsk:",
  "  /mode                     cycle the session-default permission mode",
  "  /commit, /review, /diff   git workflows on the mounted workspace",
  "  /compact, /context        manage the context window",
  "  /memory, /feedback        durable typed memory across compactions",
  "",
  "Type /help for the full command list, /help-cmd <name> for one command's signature.",
].join("\n");

defineCommand({
  name: "onboarding",
  description: "Show the first-run orientation guide.",
  handler: async (_args, ctx) => ctx.continue(ONBOARDING),
});
