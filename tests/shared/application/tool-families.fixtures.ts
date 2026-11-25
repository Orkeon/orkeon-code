// The hosts the chat family is detected on: what each registers as `chat_accounts`, and what it answers.
import { FakeToolCatalogue } from "../../support/doubles/fake-tool-catalogue.ts";

/** A catalogue whose `chat_accounts` (registered as `name`) answers `reply`; no such tool when `reply` is absent. */
export function chatHost(reply?: unknown, name = "chat_accounts"): FakeToolCatalogue {
  const catalogue = new FakeToolCatalogue();
  if (reply !== undefined) catalogue.tools.set(name, reply);
  return catalogue;
}

export const TOOL_FAMILIES_CASES: readonly { name: string; catalogue: () => FakeToolCatalogue; chat: boolean }[] = [
  { name: "offers the chat family when one account is declared", catalogue: () => chatHost({ accounts: [{ name: "team" }] }), chat: true },
  {
    name: "offers the chat family under the name the host registers, case aside",
    catalogue: () => chatHost({ accounts: [{ name: "team" }] }, "Chat_Accounts"),
    chat: true,
  },
  { name: "offers no chat family when no account is declared", catalogue: () => chatHost({ accounts: [] }), chat: false },
  { name: "offers no chat family on a host without chat_accounts", catalogue: () => chatHost(), chat: false },
  {
    name: "offers no chat family when chat_accounts fails",
    catalogue: () => chatHost(new Error("Orkeon:Tools:Chat declares no account")),
    chat: false,
  },
  { name: "offers no chat family when chat_accounts answers something else", catalogue: () => chatHost("ok"), chat: false },
];
