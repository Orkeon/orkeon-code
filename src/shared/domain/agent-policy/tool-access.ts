// The access a tool declares to Orkeon's permission gate for one call, where it depends on the arguments or
// differs from the class the catalogue files the tool under (Orkeon #219 and #223, `IBaseTool.AccessFor`): `github`
// reads for `list_issues`, `get_pr`, `search_repos` and `get_repo`, executes for `create_issue`, `create_pr` and an
// unknown or missing action; `http_api` reads for `GET`, `HEAD`, `OPTIONS` and a missing method, executes for any
// other method and for a read method that carries a body or a method-override header; `web_search` reads whatever
// the call. `rag_eval` declares an edit whatever the call (it ingests its corpus and writes its reports), the class
// the catalogue already files it under, so it has no line here. The gate runs a read without asking in every mode
// where the catalogue offers the tool; the gateless fallback of the dev crews (dev/call-guard.ts) reads this table so
// that it lets the same calls through. The catalogue's own classes (permission.ts TOOLS_BY_CLASS) are a different
// question, which modes see the tool at all: `http_api` stays out of `plan` and `dontAsk`, since a GET is an
// outbound request (mode-policy.ts). Pure.

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

const field = (input: unknown, name: string): unknown =>
  input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>)[name] : undefined;

/** Whether the call carries a body: a string with something in it, or a value of another type. */
const carriesBody = (body: unknown): boolean => body !== undefined && body !== null && body !== "";

/** Whether the call's `headers` object names a method-override header, case aside. */
const carriesMethodOverride = (headers: unknown): boolean => {
  if (headers === null || typeof headers !== "object" || Array.isArray(headers)) return false;
  const overrides = METHOD_OVERRIDE_HEADERS.map((h) => h.toLowerCase());
  return Object.keys(headers).some((name) => overrides.includes(name.toLowerCase()));
};

/** The access Orkeon declares for this call; null when the tool declares one access whatever the call, as its class says. */
export function declaredAccess(tool: string, input: unknown): ToolAccess | null {
  if (READ_WHATEVER_THE_CALL.includes(tool)) return "read";
  if (tool === "github") {
    const action = field(input, "action");
    return typeof action === "string" && GITHUB_READ_ACTIONS.includes(action) ? "read" : "execute";
  }
  if (tool === "http_api") {
    const method = field(input, "method");
    const readMethod = method === undefined || method === null || method === ""
      || (typeof method === "string" && HTTP_READ_METHODS.includes(method.toUpperCase()));
    if (!readMethod) return "execute";
    return carriesBody(field(input, "body")) || carriesMethodOverride(field(input, "headers")) ? "execute" : "read";
  }
  return null;
}
