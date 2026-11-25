// The `chat_accounts` results the count of declared accounts is read from: the documented shape, a broken account,
// and what the runtime should never answer.

const account = (name: string, extra: Record<string, unknown> = {}) => ({
  name, provider: "Teams", rights: "Read, Send", default: false, ready: true, ...extra,
});

export const DECLARED_ACCOUNTS_CASES: readonly { name: string; raw: unknown; declared: number }[] = [
  { name: "counts no account in an empty list", raw: { accounts: [] }, declared: 0 },
  { name: "counts the one account declared", raw: { accounts: [account("team", { default: true })] }, declared: 1 },
  { name: "counts every account declared", raw: { accounts: [account("team"), account("bot"), account("hook")] }, declared: 3 },
  {
    name: "counts an account that cannot connect: it is declared",
    raw: { accounts: [{ name: "team", provider: "?", default: true, ready: false, problem: "no TenantId" }] },
    declared: 1,
  },
  { name: "reads the JSON text of a result", raw: JSON.stringify({ accounts: [account("team")] }), declared: 1 },
  { name: "reads the fields whatever their case", raw: { Accounts: [{ Name: "team", Ready: true }] }, declared: 1 },
  { name: "counts no account in a result without a list", raw: { accounts: "team" }, declared: 0 },
  { name: "counts no account in a result that is no object", raw: ["team"], declared: 0 },
  { name: "counts no account in a text that is no JSON", raw: "no chat account is declared", declared: 0 },
  { name: "counts no account in no result", raw: undefined, declared: 0 },
  { name: "leaves out an entry without a name", raw: { accounts: [{ provider: "Teams" }, { name: " " }, "team"] }, declared: 0 },
];

/** The records /chat lists, read from the same results. */
export const ACCOUNT_RECORDS_CASES: readonly { name: string; raw: unknown; records: unknown[] }[] = [
  {
    name: "reads an account ready, its rights and its default mark",
    raw: { accounts: [account("me", { default: true })] },
    records: [{ name: "me", provider: "Teams", rights: "Read, Send", isDefault: true, ready: true }],
  },
  {
    name: "reads an account that cannot connect with its problem and the unresolved provider",
    raw: { accounts: [{ name: "team", provider: "?", default: false, ready: false, problem: "no TenantId" }] },
    records: [{ name: "team", provider: "?", isDefault: false, ready: false, problem: "no TenantId" }],
  },
  {
    name: "reads the keys a CLR object spells with a capital",
    raw: { Accounts: [{ Name: "builds", Provider: "TeamsWebhook", Rights: "Send", Default: false, Ready: true }] },
    records: [{ name: "builds", provider: "TeamsWebhook", rights: "Send", isDefault: false, ready: true }],
  },
  {
    name: "reads the accounts of a JSON text in their order",
    raw: JSON.stringify({ accounts: [account("me"), account("watch")] }),
    records: [
      { name: "me", provider: "Teams", rights: "Read, Send", isDefault: false, ready: true },
      { name: "watch", provider: "Teams", rights: "Read, Send", isDefault: false, ready: true },
    ],
  },
  {
    name: "reads a missing provider as unresolved and leaves out empty rights and problem",
    raw: { accounts: [{ name: "me", rights: "", problem: " ", ready: "yes" }] },
    records: [{ name: "me", provider: "?", isDefault: false, ready: false }],
  },
  { name: "reads no account in a text that is no JSON", raw: "no chat account is declared", records: [] },
];

