// What `chat_accounts` answers, read as the one fact the main loop's catalogue needs: how many chat accounts the
// operator declared (`Orkeon:Tools:Chat:Accounts`). The tool makes no request; it lists every declared account,
// ready or not. An account that cannot connect (`ready` false, a `problem`, a provider `?`) is declared all the
// same: the family is offered, and its calls say what to fix (`SignInRequired`: `orkeon chat login <account>`).
// Anything that is not the documented shape (`{ accounts: [{ name, … }] }`, or its JSON) reads as no account. /chat
// reads the same records to list the accounts and their readiness. Pure.

/** The tool that lists the declared chat accounts. */
export const CHAT_ACCOUNTS_TOOL = "chat_accounts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The field `name` of `record`, its key matched case aside (a CLR object spells it `Name`); undefined when absent. */
const field = (record: Record<string, unknown>, name: string): unknown => {
  const key = Object.keys(record).find((k) => k.toLowerCase() === name);
  return key === undefined ? undefined : record[key];
};

/** The result as an object: itself, or the object its JSON text holds; undefined otherwise. */
function resultObject(raw: unknown): Record<string, unknown> | undefined {
  if (isRecord(raw)) return raw;
  if (typeof raw !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** One declared account, as `chat_accounts` lists it, read off whatever case its keys are spelt in. */
export interface ChatAccountRecord {
  name: string;
  /** `Teams`, `TeamsWebhook`; `?` when the declaration does not resolve, or the field is absent. */
  provider: string;
  /** Of Read, Send, Edit, Delete, React, Meetings; undefined when the result names none. */
  rights?: string;
  /** The account the tools use when a call names none. */
  isDefault: boolean;
  ready: boolean;
  /** What keeps the account from connecting; undefined when none is given. */
  problem?: string;
}

/** The provider `chat_accounts` names when a declaration does not resolve. */
export const UNRESOLVED_PROVIDER = "?";

/** A field shown on one line of /chat (a name, a problem): cut to this many characters. */
export const MAX_CHAT_FIELD_CHARS = 160;

/** `text` on one line, its runs of blanks made single spaces, cut at MAX_CHAT_FIELD_CHARS with an ellipsis. */
export function chatField(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= MAX_CHAT_FIELD_CHARS ? flat : `${flat.slice(0, MAX_CHAT_FIELD_CHARS - 1)}…`;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

/** The declared accounts of a `chat_accounts` result, in its order: its entries that carry a name. */
export function chatAccounts(raw: unknown): ChatAccountRecord[] {
  const result = resultObject(raw);
  const accounts = result === undefined ? undefined : field(result, "accounts");
  if (!Array.isArray(accounts)) return [];
  const records: ChatAccountRecord[] = [];
  for (const account of accounts) {
    if (!isRecord(account)) continue;
    const name = text(field(account, "name"));
    if (name === undefined) continue;
    const rights = text(field(account, "rights"));
    const problem = text(field(account, "problem"));
    records.push({
      name,
      provider: text(field(account, "provider")) ?? UNRESOLVED_PROVIDER,
      ...(rights === undefined ? {} : { rights }),
      isDefault: field(account, "default") === true,
      ready: field(account, "ready") === true,
      ...(problem === undefined ? {} : { problem }),
    });
  }
  return records;
}

/** The number of declared accounts in a `chat_accounts` result: its entries that carry a name. */
export function declaredChatAccounts(raw: unknown): number {
  return chatAccounts(raw).length;
}
