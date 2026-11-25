// What `chat_accounts` answers, read as the one fact the main loop's catalogue needs: how many chat accounts the
// operator declared (`Orkeon:Tools:Chat:Accounts`). The tool makes no request; it lists every declared account,
// ready or not. An account that cannot connect (`ready` false, a `problem`, a provider `?`) is declared all the
// same: the family is offered, and its calls say what to fix (`SignInRequired`: `orkeon chat login <account>`).
// Anything that is not the documented shape (`{ accounts: [{ name, … }] }`, or its JSON) reads as no account. Pure.

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

/** The number of declared accounts in a `chat_accounts` result: its entries that carry a name. */
export function declaredChatAccounts(raw: unknown): number {
  const result = resultObject(raw);
  const accounts = result === undefined ? undefined : field(result, "accounts");
  if (!Array.isArray(accounts)) return 0;
  return accounts.filter((account) => {
    const name = isRecord(account) ? field(account, "name") : undefined;
    return typeof name === "string" && name.trim().length > 0;
  }).length;
}
