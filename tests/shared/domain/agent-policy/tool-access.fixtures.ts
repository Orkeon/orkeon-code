// The calls declaredAccess reads, as Orkeon #219 declares them.
import type { ToolAccess } from "../../../../src/shared/domain/agent-policy/tool-access.ts";

export interface AccessCase { name: string; tool: string; input: unknown; access: ToolAccess | null }

export const ACCESS_CASES: readonly AccessCase[] = [
  { name: "github get_pr reads", tool: "github", input: { action: "get_pr", owner: "o", repo: "r", number: 1 }, access: "read" },
  { name: "github list_issues reads", tool: "github", input: { action: "list_issues" }, access: "read" },
  { name: "github search_repos reads", tool: "github", input: { action: "search_repos" }, access: "read" },
  { name: "github get_repo reads", tool: "github", input: { action: "get_repo" }, access: "read" },
  { name: "github create_pr executes", tool: "github", input: { action: "create_pr" }, access: "execute" },
  { name: "github create_issue executes", tool: "github", input: { action: "create_issue" }, access: "execute" },
  { name: "github without an action executes", tool: "github", input: {}, access: "execute" },
  { name: "github with an unknown action executes", tool: "github", input: { action: "delete_repo" }, access: "execute" },
  { name: "github with an input that is no object executes", tool: "github", input: "get_pr", access: "execute" },
  { name: "http_api GET reads", tool: "http_api", input: { url: "https://x", method: "GET" }, access: "read" },
  { name: "http_api get, in lower case, reads", tool: "http_api", input: { url: "https://x", method: "get" }, access: "read" },
  { name: "http_api HEAD reads", tool: "http_api", input: { url: "https://x", method: "HEAD" }, access: "read" },
  { name: "http_api OPTIONS reads", tool: "http_api", input: { url: "https://x", method: "OPTIONS" }, access: "read" },
  { name: "http_api without a method reads (a GET)", tool: "http_api", input: { url: "https://x" }, access: "read" },
  { name: "http_api POST executes", tool: "http_api", input: { url: "https://x", method: "POST" }, access: "execute" },
  { name: "http_api DELETE executes", tool: "http_api", input: { url: "https://x", method: "DELETE" }, access: "execute" },
  { name: "http_api with a method that is no string executes", tool: "http_api", input: { url: "https://x", method: 1 }, access: "execute" },
  { name: "rag_eval reads whatever the call", tool: "rag_eval", input: { dataset: "eval/golden.yaml" }, access: "read" },
  { name: "web_search reads whatever the call", tool: "web_search", input: { query: "x" }, access: "read" },
  { name: "file_write declares one access, its class's", tool: "file_write", input: { path: "a" }, access: null },
  { name: "shell_command declares one access, its class's", tool: "shell_command", input: { command: "ls" }, access: null },
];
