// /agents (B-12) — list, create, edit and delete saved agent configurations
// (baseline 04 §/agents: "…stored in `.orkeon/agents.json`").
//
// A FILE, not session state: a saved agent is meant to outlive the session, so
// /reset-session must not take someone's definitions with it. It sits beside
// config.json (B-6) under /workspace/.orkeon/, hand-editable on purpose.
//
// The listing merges two sources and labels them, because only one is mutable:
// the crews discovered by the host (what actually runs today) and this file.
// `edit` is `add` over an existing name — a REPL one-liner is a poor field editor,
// and an overwrite that says "replaced" is clearer than a partial patch.
//
// Note on scope: Orkeon Code cannot DISPATCH a saved agent. `spawn_agent` is not
// registered as an IBaseTool in this host (proven by the B-8 runtime probe), so
// there is no path from a definition to a running agent. The registry is therefore
// honest storage, and the command says so rather than implying a launch.

import type { CrewHost, Files } from "../../shared/application/ports.ts";
import { readJsonFile, writeJsonFile } from "../../shared/application/json-file.ts";
import {
  parseAgentRegistry, serializeAgentRegistry, validateSavedAgent,
  upsertAgent, removeAgent, describeAgentRows,
} from "../../shared/domain/agent-registry.ts";
import type { SavedAgent } from "../../shared/domain/agent-registry.ts";
import type { CommandView } from "./view.ts";

export const AGENTS_FILE_PATH = "/workspace/.orkeon/agents.json";

export const AGENTS_USAGE =
  "usage: /agents [list] | add <name> <role> | <goal> | remove <name> | show <name>";

export interface AgentsDeps {
  files: Pick<Files, "read" | "write">;
  crews: Pick<CrewHost, "listCrews">;
}

/** The same reading as config-store (B-6): absent is empty, and a file that could
 *  not be parsed — as JSON, or as a registry — is flagged so that nothing writes
 *  over it. */
async function readRegistry(
  files: Pick<Files, "read">,
): Promise<{ agents: SavedAgent[]; dropped: string[]; malformed: boolean }> {
  const { value, malformed } = await readJsonFile(files, AGENTS_FILE_PATH);
  if (malformed) return { agents: [], dropped: [], malformed: true };
  try {
    return { ...parseAgentRegistry(value), malformed: false };
  } catch {
    // An entry whose fields cannot even be read as text (`{"toString":1}`).
    return { agents: [], dropped: [], malformed: true };
  }
}

async function writeRegistry(files: Pick<Files, "write">, agents: readonly SavedAgent[]): Promise<void> {
  await writeJsonFile(files, AGENTS_FILE_PATH, serializeAgentRegistry(agents));
}

/** `/agents [list|show|add|edit|remove|delete] …`, from the command's raw tokens. */
export async function runAgents(tokens: string[], deps: AgentsDeps): Promise<CommandView> {
  const { files } = deps;
  const sub = (tokens[0] ?? "list").toLowerCase();
  const crews = deps.crews.listCrews();

  switch (sub) {
    case "list": {
      const { agents, dropped, malformed } = await readRegistry(files);
      const notes = [`file: ${AGENTS_FILE_PATH} (survives /reset-session)`];
      if (dropped.length > 0) {
        notes.push(`⚠ ${dropped.length} stored entr(y/ies) ignored — missing role or goal: ${dropped.join(", ")}`);
      }
      if (malformed) notes.push(`⚠ ${AGENTS_FILE_PATH} could not be parsed; it is left untouched.`);
      notes.push("saved agents are storage only — this host cannot dispatch one (spawn_agent is not registered).");
      return { table: describeAgentRows(crews, agents), text: notes.join("\n") };
    }

    case "show": {
      const name = String(tokens[1] ?? "").trim().toLowerCase();
      const { agents } = await readRegistry(files);
      const found = agents.find((a) => a.name === name);
      if (found) {
        return {
          text: `${found.name}\n  role : ${found.role}\n  goal : ${found.goal}\n` +
            `  tools: ${found.tools.length > 0 ? found.tools.join(", ") : "(inherited from the crew)"}`,
        };
      }
      if (crews.some((c) => c.toLowerCase() === name)) {
        return { text: `'${name}' is a built-in crew (crews/${name}/), not a saved agent — see its crew.ork.ts.` };
      }
      return { text: `no saved agent '${name}'. /agents list shows what there is.` };
    }

    case "add":
    case "edit": {
      // `add <name> <role> | <goal>` — the pipe separates two free-text fields, so
      // neither has to be quoted in a REPL line.
      const rest = tokens.slice(1).join(" ");
      const [head, ...goalParts] = rest.split("|");
      const headTokens = head.trim().split(/\s+/).filter(Boolean);
      const name = headTokens.shift() ?? "";
      const verdict = validateSavedAgent({
        name,
        role: headTokens.join(" "),
        goal: goalParts.join("|").trim(),
      });
      if (!verdict.ok) return { text: `${verdict.reason}\n${AGENTS_USAGE}` };

      const { agents, malformed } = await readRegistry(files);
      if (malformed) {
        return {
          text: `refusing to write: ${AGENTS_FILE_PATH} exists but could not be parsed, and overwriting ` +
            "it would discard whatever it holds. Fix or delete it, then retry.",
        };
      }
      const { agents: next, replaced } = upsertAgent(agents, verdict.agent);
      await writeRegistry(files, next);
      return { text: `agent '${verdict.agent.name}' ${replaced ? "replaced" : "saved"} in ${AGENTS_FILE_PATH}.` };
    }

    case "remove":
    case "delete": {
      const name = String(tokens[1] ?? "").trim();
      if (name.length === 0) return { text: AGENTS_USAGE };
      const { agents, malformed } = await readRegistry(files);
      if (malformed) return { text: `refusing to write: ${AGENTS_FILE_PATH} could not be parsed.` };
      const { agents: next, removed } = removeAgent(agents, name);
      if (!removed) {
        return {
          text: crews.some((c) => c.toLowerCase() === name.toLowerCase())
            ? `'${name}' is a built-in crew — it is not stored here and cannot be removed with /agents.`
            : `no saved agent '${name}'.`,
        };
      }
      await writeRegistry(files, next);
      return { text: `agent '${name}' removed from ${AGENTS_FILE_PATH}.` };
    }

    default:
      return { text: AGENTS_USAGE };
  }
}
