// /chat — the chat accounts of this session, read from the host's `chat_accounts` (no request, no right needed): one
// line per declared account, its default mark, provider, rights and readiness; for an account not ready, its problem
// (the runtime's own text, which names the fix: a variable to set, the sign-in to run); then where the chat tools are offered. A host without
// the tool, no account, a failing call: one line each. What the tool returns (a name, a problem) is shown as data,
// on one line, cut. Lives under commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this file is never
// loaded as a command.

import type { ToolCatalogue } from "../../../shared/application/ports.ts";
import {
  CHAT_ACCOUNTS_TOOL, type ChatAccountRecord, chatAccounts, chatField,
} from "../../../shared/domain/agent-policy/chat-accounts.ts";
import { errorText } from "../../../shared/domain/error-text.ts";
import type { CommandView } from "../view.ts";
import {
  CHAT_DEFAULT_MARK, CHAT_NO_RIGHTS, CHAT_NOT_READY, CHAT_READY, CHAT_TOOLS_OFFERED, CHAT_USAGE, NO_CHAT_ACCOUNT, NO_CHAT_TOOLS,
  chatAccountLine, chatAccountsFailed, chatNotReady,
} from "./messages.ts";

export interface ChatDeps {
  catalogue: Pick<ToolCatalogue, "find" | "call">;
}

/** The line of one account. Its problem is the runtime's own sentence, which says what to do: `chat_accounts` does
 *  not tell a user from an application (both `Teams`), so this command adds no sign-in line of its own. */
export function accountLine(account: ChatAccountRecord): string {
  const name = chatField(account.name);
  const state = account.ready
    ? CHAT_READY
    : account.problem === undefined ? CHAT_NOT_READY : chatNotReady(chatField(account.problem));
  return chatAccountLine(
    name,
    account.isDefault ? CHAT_DEFAULT_MARK : "",
    chatField(account.provider),
    account.rights === undefined ? CHAT_NO_RIGHTS : chatField(account.rights),
    state,
  );
}

/** `/chat`, from the command's raw tokens: the accounts and their readiness, or the one line that says why none. */
export async function runChat(tokens: readonly string[], deps: ChatDeps): Promise<CommandView> {
  if (tokens.length > 0) return { text: CHAT_USAGE };
  const registered = deps.catalogue.find(CHAT_ACCOUNTS_TOOL);
  if (registered === undefined) return { text: NO_CHAT_TOOLS };
  let raw: unknown;
  try {
    raw = await deps.catalogue.call(registered, {});
  } catch (error) {
    return { text: chatAccountsFailed(errorText(error)) };
  }
  const accounts = chatAccounts(raw);
  if (accounts.length === 0) return { text: NO_CHAT_ACCOUNT };
  return { lines: accounts.map(accountLine), text: CHAT_TOOLS_OFFERED };
}
