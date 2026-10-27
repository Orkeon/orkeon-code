// The access a tool declares to Orkeon's permission gate for one call, where it depends on the arguments or
// differs from the class the catalogue files the tool under (Orkeon #219, `IBaseTool.AccessFor`): `github` reads for
// `list_issues`, `get_pr`, `search_repos` and `get_repo`, executes for `create_issue`, `create_pr` and an unknown or
// missing action; `http_api` reads for `GET`, `HEAD`, `OPTIONS` and a missing method, executes otherwise; `rag_eval`
// and `web_search` read whatever the call. The gate runs a read without asking in every mode where the catalogue
// offers the tool; the gateless fallback of the dev crews (dev/call-guard.ts) reads this table so that it lets the
// same calls through. The catalogue's own classes (permission.ts TOOLS_BY_CLASS) are a different question, which
// modes see the tool at all: `rag_eval` stays with the edits, since it re-ingests a corpus into a collection, and
// `http_api` out of `plan` and `dontAsk`, since a GET is an outbound request (mode-policy.ts). Pure.

export type ToolAccess = "read" | "execute";

/** The `github` actions Orkeon reads for. */
export const GITHUB_READ_ACTIONS: readonly string[] = ["list_issues", "get_pr", "search_repos", "get_repo"];

/** The `http_api` methods Orkeon reads for; a missing method is a GET. */
export const HTTP_READ_METHODS: readonly string[] = ["GET", "HEAD", "OPTIONS"];

/** The tools that declare a read whatever the call, though the catalogue files them elsewhere. */
const READ_WHATEVER_THE_CALL: readonly string[] = ["rag_eval", "web_search"];

const field = (input: unknown, name: string): unknown =>
  input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>)[name] : undefined;

/** The access Orkeon declares for this call; null when the tool declares one access whatever the call, as its class says. */
export function declaredAccess(tool: string, input: unknown): ToolAccess | null {
  if (READ_WHATEVER_THE_CALL.includes(tool)) return "read";
  if (tool === "github") {
    const action = field(input, "action");
    return typeof action === "string" && GITHUB_READ_ACTIONS.includes(action) ? "read" : "execute";
  }
  if (tool === "http_api") {
    const method = field(input, "method");
    if (method === undefined || method === null || method === "") return "read";
    return typeof method === "string" && HTTP_READ_METHODS.includes(method.toUpperCase()) ? "read" : "execute";
  }
  return null;
}
