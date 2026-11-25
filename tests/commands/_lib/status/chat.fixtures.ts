// The hosts /chat runs on: what each registers as `chat_accounts` and what it answers, and the lines expected.
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";

/** A catalogue whose `chat_accounts` answers `reply`; no such tool when `reply` is absent. */
export function chatHost(reply?: unknown): FakeToolCatalogue {
  const catalogue = new FakeToolCatalogue();
  if (reply !== undefined) catalogue.tools.set("chat_accounts", reply);
  return catalogue;
}

/** The three kinds of account of config/appsettings.chat.example.json, one of each state. */
export const THREE_ACCOUNTS = {
  accounts: [
    { name: "me", provider: "Teams", rights: "Read, Send", default: true, ready: true },
    {
      name: "watch", provider: "Teams", rights: "Read", default: false, ready: false,
      problem: "Chat account 'watch' needs a sign-in: run `orkeon chat login watch` in a terminal.",
    },
    { name: "builds", provider: "TeamsWebhook", rights: "Send", default: false, ready: false, problem: "CHAT_BUILDS_WEBHOOK is not set" },
  ],
};

export const THREE_ACCOUNT_LINES: readonly string[] = [
  "  me (default): Teams, Read, Send; ready",
  "  watch: Teams, Read; not ready: Chat account 'watch' needs a sign-in: run `orkeon chat login watch` in a terminal.",
  "    a user account signs in from a terminal: orkeon chat login watch --settings <the settings file of this session>",
  "  builds: TeamsWebhook, Send; not ready: CHAT_BUILDS_WEBHOOK is not set",
];

/** One line per state of one account, the sign-in line where it signs in. */
export const ACCOUNT_LINE_CASES: readonly { name: string; account: Record<string, unknown>; lines: readonly string[] }[] = [
  {
    name: "shows an unresolved account not ready with its problem, without a sign-in line",
    account: { name: "old", provider: "?", default: false, ready: false, problem: "Rights is missing" },
    lines: ["  old: ?, no rights named; not ready: Rights is missing"],
  },
  {
    name: "shows an account not ready without a problem as not ready alone",
    account: { name: "me", provider: "Teams", rights: "Read", default: false, ready: false },
    lines: [
      "  me: Teams, Read; not ready",
      "    a user account signs in from a terminal: orkeon chat login me --settings <the settings file of this session>",
    ],
  },
  {
    name: "shows a problem over several lines on one",
    account: { name: "hook", provider: "TeamsWebhook", rights: "Send", default: false, ready: false, problem: "no address\n  set CHAT_HOOK" },
    lines: ["  hook: TeamsWebhook, Send; not ready: no address set CHAT_HOOK"],
  },
];

/** A problem longer than a field is shown. */
export const LONG_PROBLEM = "p".repeat(400);
