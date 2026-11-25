/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /chat — the chat accounts this session can reach: each declared account, its provider, its rights and whether it
// is ready, with what the runtime says an account not ready lacks (docs/chat.md). Entry point: wires the host's tools
// into _lib/status/chat.ts (runChat), which asks `chat_accounts` and words the answer.
import { rawTokens } from "../_lib/args.ts";
import { runChat } from "../_lib/status/chat.ts";
import { showView } from "../_lib/view.ts";
import { orkeonToolCatalogue } from "../../shared/infrastructure/orkeon/wiring.ts";

defineCommand({
  name: "chat",
  description: "List the chat accounts of this session (Orkeon:Tools:Chat:Accounts): provider, rights, whether each is ready.",
  handler: async (args, ctx) => showView(ctx, await runChat(rawTokens(args), { catalogue: orkeonToolCatalogue(ctx.services) })),
});
