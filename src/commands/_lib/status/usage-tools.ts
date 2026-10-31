// /usage tools [text]: the session's [tools] messages (shared/domain/tool-trace.ts), each under the request it
// answered, the lines kept to those holding the text when one is given.
import type { SessionStore } from "../../../shared/application/ports.ts";
import type { SessionMsg } from "../../../shared/domain/types.ts";
import { isToolTrace } from "../../../shared/domain/tool-trace.ts";
import type { CommandView } from "../view.ts";

/** A request is cut past this many characters on its line. */
export const MAX_REQUEST_CHARS = 100;

export const NO_TOOL_TRACE = "no tool call recorded in this session yet";

export interface UsageToolsDeps {
  session: Pick<SessionStore, "readMessages">;
}

export async function runUsageTools(text: string, deps: UsageToolsDeps): Promise<CommandView> {
  let messages: SessionMsg[];
  try {
    messages = (await deps.session.readMessages()).messages;
  } catch {
    messages = [];
  }
  const lines = toolTraceLines(messages, text.trim());
  if (lines.length > 0) return { lines };
  return { text: text.trim().length === 0 ? NO_TOOL_TRACE : `no tool call holds '${text.trim()}' in this session` };
}

/** Each turn's request, then its calls, the calls holding `text` alone (case aside) when it is not empty. */
export function toolTraceLines(messages: readonly SessionMsg[], text: string): string[] {
  const needle = text.toLowerCase();
  const out: string[] = [];
  let request = "(no request)";
  for (const m of messages) {
    const content = String(m.content ?? "");
    if (m.role === "user" && !content.startsWith("[")) request = content;
    if (m.role !== "system" || !isToolTrace(content)) continue;
    const calls = content.split("\n").slice(1).filter((l) => needle.length === 0 || l.toLowerCase().includes(needle));
    if (calls.length === 0) continue;
    out.push(`> ${requestLine(request)}`, ...calls.map((c) => `  ${c}`));
  }
  return out;
}

function requestLine(request: string): string {
  const flat = request.replace(/\s+/g, " ").trim();
  return flat.length > MAX_REQUEST_CHARS ? flat.slice(0, MAX_REQUEST_CHARS - 1) + "…" : flat;
}
