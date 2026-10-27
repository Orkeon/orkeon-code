// The access a tool declares to Orkeon's permission gate for one call, where it depends on the arguments or
// differs from the class the catalogue files the tool under (Orkeon #219 and #223, `IBaseTool.AccessFor`): `github`
// reads for `list_issues`, `get_pr`, `search_repos` and `get_repo`, executes for `create_issue`, `create_pr` and an
// unknown or missing action; `http_api` reads for `GET`, `HEAD`, `OPTIONS` and a missing method, executes for any
// other method and for a read method that carries a body or a method-override header; `web_search` reads whatever
// the call. The arguments are read as Orkeon reads them: a key matched case aside (`Method`, `BODY`), the action
// trimmed and compared case aside, the method compared case aside (an empty one is no read method), a body present
// whatever its content, an empty string included, and the headers' names taken from an object or from a JSON string
// holding one. `rag_eval` declares an edit whatever the call (it ingests its corpus and writes its reports), the
// class the catalogue already files it under, so it has no line here. The gate runs a read without asking in every
// mode where the catalogue offers the tool; the gateless fallback of the dev crews (dev/call-guard.ts) reads this
// table so that it lets the same calls through. The catalogue's own classes (permission.ts TOOLS_BY_CLASS) are a
// different question, which modes see the tool at all: `http_api` stays out of `plan` and `dontAsk`, since a GET is
// an outbound request (mode-policy.ts). Pure.

export type ToolAccess = "read" | "execute";

/** The `github` actions Orkeon reads for. */
export const GITHUB_READ_ACTIONS: readonly string[] = ["list_issues", "get_pr", "search_repos", "get_repo"];

/** The `http_api` methods Orkeon reads for; a missing method is a GET. */
export const HTTP_READ_METHODS: readonly string[] = ["GET", "HEAD", "OPTIONS"];

/** The headers that turn a read method of `http_api` into an execute, whatever their case: a server may run
 *  the method they name instead of the one sent (Orkeon #223). */
export const METHOD_OVERRIDE_HEADERS: readonly string[] = ["X-HTTP-Method-Override", "X-HTTP-Method", "X-Method-Override"];

/** The tools that declare a read whatever the call, though the catalogue files them elsewhere. */
const READ_WHATEVER_THE_CALL: readonly string[] = ["web_search"];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The argument named `name`, its key matched case aside, as Orkeon matches it; undefined when absent. */
const field = (input: unknown, name: string): unknown => {
  if (!isPlainObject(input)) return undefined;
  const key = Object.keys(input).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : input[key];
};

/** Whether the call carries a body: any value but an absent or null one, an empty string included. */
const carriesBody = (body: unknown): boolean => body !== undefined && body !== null;

/** The names of the call's headers: the keys of an object, or of the object a JSON string holds; none otherwise. */
const headerNames = (headers: unknown): string[] => {
  if (isPlainObject(headers)) return Object.keys(headers);
  if (typeof headers !== "string" || headers.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(headers);
    return isPlainObject(parsed) ? Object.keys(parsed) : [];
  } catch {
    return [];
  }
};

/** Whether the call's headers name a method-override header, case aside. */
const carriesMethodOverride = (headers: unknown): boolean => {
  const overrides = METHOD_OVERRIDE_HEADERS.map((h) => h.toLowerCase());
  return headerNames(headers).some((name) => overrides.includes(name.toLowerCase()));
};

/** The access Orkeon declares for this call; null when the tool declares one access whatever the call, as its class says. */
export function declaredAccess(tool: string, input: unknown): ToolAccess | null {
  if (READ_WHATEVER_THE_CALL.includes(tool)) return "read";
  if (tool === "github") {
    const action = field(input, "action");
    return typeof action === "string" && GITHUB_READ_ACTIONS.includes(action.trim().toLowerCase()) ? "read" : "execute";
  }
  if (tool === "http_api") {
    const method = field(input, "method");
    const readMethod = method === undefined || method === null
      || (typeof method === "string" && HTTP_READ_METHODS.includes(method.toUpperCase()));
    if (!readMethod) return "execute";
    return carriesBody(field(input, "body")) || carriesMethodOverride(field(input, "headers")) ? "execute" : "read";
  }
  return null;
}
