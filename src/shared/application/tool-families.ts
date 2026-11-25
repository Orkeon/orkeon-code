// The tool families the host offers only on its operator's declaration, read before a main-loop turn is launched
// and by /permissions, so the catalogue the turn gets and the one /permissions shows are the same. The chat family:
// `chat_accounts` (no request, no right needed) says whether one account at least is declared. A host that does not
// register the tool has no chat family; a call that fails is no account (the runtime may fail it when none is
// declared), never a failure of the launch.

import type { ToolCatalogue } from "./ports.ts";
import { CHAT_ACCOUNTS_TOOL, declaredChatAccounts } from "../domain/agent-policy/chat-accounts.ts";
import type { ToolFamilies } from "../domain/agent-policy/permission.ts";

/** Whether this host offers the chat family: it registers `chat_accounts` and the call lists one account at least. */
export async function readToolFamilies(catalogue: Pick<ToolCatalogue, "find" | "call">): Promise<ToolFamilies> {
  const registered = catalogue.find(CHAT_ACCOUNTS_TOOL);
  if (registered === undefined) return { chat: false };
  try {
    return { chat: declaredChatAccounts(await catalogue.call(registered, {})) > 0 };
  } catch {
    return { chat: false };
  }
}
