// /export — conversation, memory and cost as one markdown document, as the
// baseline specifies (B-11 deepening); runExport reads them over the ports and
// writes the file. Lives under commands/_lib/ — the loader's SearchPattern is
// "*.cmd.ts", so this file is never loaded as a command.

import type {
  Files, MemoryStore, SessionCost, SessionMessages, SessionStore, Telemetry,
} from "../../../shared/application/ports.ts";
import { MEMORY_CATEGORIES } from "../../../shared/domain/agent-policy/memory-categories.ts";
import type { CommandView } from "../view.ts";

export interface ExportInputs {
  messages: ReadonlyArray<{ role?: unknown; content?: unknown }>;
  memory: Readonly<Record<string, readonly string[]>>;
  cost: { totalTokens?: unknown; costUsd?: unknown; calls?: unknown };
  /** Passed in rather than read here: this module is pure. */
  generatedAt?: string;
}

/**
 * The exported markdown.
 *
 * Baseline 04 §/export: "conversation history, typed memory entries, and cost/token
 * usage". The pre-B-11 handler wrote the conversation alone, which is the part that
 * is already recoverable from the session; the memory and the cost are the two an
 * export exists to preserve. Sections are omitted when empty rather than rendered
 * as headings over nothing — an export with "## Memory" and no entries reads as
 * data loss.
 */
export function renderSessionExport(i: ExportInputs): string {
  const out: string[] = ["# Session Export", ""];
  if (i.generatedAt) out.push(`_generated ${i.generatedAt}_`, "");

  const cost = Number(i.cost?.costUsd ?? 0) || 0;
  out.push(
    "## Usage",
    "",
    `- Messages: ${i.messages.length}`,
    `- LLM calls: ${Number(i.cost?.calls ?? 0) || 0}`,
    `- Tokens: ${Number(i.cost?.totalTokens ?? 0) || 0}`,
    `- Cost: $${cost.toFixed(4)}`,
    "",
  );

  const categories = Object.entries(i.memory ?? {}).filter(([, v]) => (v?.length ?? 0) > 0);
  if (categories.length > 0) {
    out.push("## Memory", "");
    for (const [category, entries] of categories) {
      out.push(`### ${category}`, "");
      for (const e of entries) out.push(`- ${e}`);
      out.push("");
    }
  }

  out.push("## Conversation", "");
  if (i.messages.length === 0) {
    out.push("_(the session buffer is empty)_", "");
  } else {
    for (const m of i.messages) {
      out.push(`**${String(m.role ?? "?")}:** ${String(m.content ?? "")}`, "");
    }
  }
  return out.join("\n");
}

export const DEFAULT_EXPORT_PATH = "/output/session-export.md";

export interface ExportDeps {
  session: Pick<SessionStore, "readMessages">;
  telemetry: Pick<Telemetry, "readCost">;
  memory: Pick<MemoryStore, "list">;
  files: Pick<Files, "write">;
}

/** `/export [path]`, from the command's raw tokens: the session written as markdown. */
export async function runExport(tokens: readonly string[], deps: ExportDeps): Promise<CommandView> {
  const path = tokens[0] ?? DEFAULT_EXPORT_PATH;

  const [buffer, cost] = await Promise.all([
    deps.session.readMessages().catch((): SessionMessages => ({ stored: [], messages: [] })),
    deps.telemetry.readCost().catch((): SessionCost => ({})),
  ]);

  // Per-category, and per-category tolerant: one unavailable category must not
  // cost the export its other three.
  const memory: Record<string, string[]> = {};
  for (const category of MEMORY_CATEGORIES) {
    try {
      const contents = (await deps.memory.list(category)).map((e) => e.content).filter((c) => c.length > 0);
      if (contents.length > 0) memory[category] = contents;
    } catch { /* category unavailable → omitted, not empty-headed */ }
  }

  const messages = buffer.stored as Array<{ role?: unknown; content?: unknown }>;
  const md = renderSessionExport({
    messages,
    memory,
    cost: { totalTokens: cost.totalTokens, costUsd: cost.costUsd, calls: cost.totalCalls },
  });

  await deps.files.write(path, md);
  const memoryCount = Object.values(memory).reduce((n, v) => n + v.length, 0);
  return { text: `exported → ${path} (${messages.length} message(s), ${memoryCount} memory entr(y/ies), cost included)` };
}
