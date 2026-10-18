// B-12 — the saved-agent registry: schema and CRUD decisions. Pure, no IO.
//
// Baseline 04 §/agents: "List, create, delete, and edit saved agent configurations
// stored in `.orkeon/agents.json`". So the registry is a FILE, not session state —
// a saved agent is meant to outlive the session, and `/clear` must not take
// someone's agent definitions with it. It lives beside `config.json` (B-6), under
// the same `/workspace/.orkeon/` directory the operator can read and edit by hand.
//
// The built-in crews are NOT in this file. They are discovered from the crews
// directory by the host, so listing them from a stored copy would go stale the
// moment a crew is added or renamed — the command merges the two at read time and
// labels which is which.

/** A saved agent definition. Deliberately small: the fields an agent needs to run. */
export interface SavedAgent {
  name: string;
  role: string;
  goal: string;
  /** Tool names; empty means "whatever the crew grants". */
  tools: string[];
}

/** Names are the file's keys, so they must be a stable, typo-visible slug. */
const NAME_RE = /^[a-z][a-z0-9-]*$/;

export type AgentVerdict =
  | { ok: true; agent: SavedAgent }
  | { ok: false; reason: string };

/**
 * Validates a definition on the way in.
 *
 * `role` and `goal` are required because an agent without them is not a definition
 * an operator could later understand, and this file is meant to be re-read by a
 * human. Refusing here is right — unlike a model name or a lens, a saved agent has
 * no useful "fall back to the default" reading.
 */
export function validateSavedAgent(raw: {
  name?: unknown; role?: unknown; goal?: unknown; tools?: unknown;
}): AgentVerdict {
  const name = String(raw?.name ?? "").trim().toLowerCase();
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      reason: `'${String(raw?.name ?? "")}' is not a valid agent name (lowercase letters, digits and '-', starting with a letter)`,
    };
  }
  const role = String(raw?.role ?? "").trim();
  const goal = String(raw?.goal ?? "").trim();
  if (role.length === 0) return { ok: false, reason: `agent '${name}' needs a role` };
  if (goal.length === 0) return { ok: false, reason: `agent '${name}' needs a goal` };

  const tools = Array.isArray(raw?.tools)
    ? [...new Set(raw.tools.map((t: unknown) => String(t ?? "").trim()).filter((t: string) => t.length > 0))]
    : [];

  return { ok: true, agent: { name, role, goal, tools } };
}

/**
 * Reads the stored map into a list, dropping entries that no longer validate.
 *
 * Dropped rather than fatal, and the count is returned: the file is hand-editable,
 * and refusing to list ten good agents because an eleventh lost its `goal` would
 * make a typo cost the whole registry. Silence is the part that is not acceptable.
 */
export function parseAgentRegistry(raw: unknown): { agents: SavedAgent[]; dropped: string[] } {
  const agents: SavedAgent[] = [];
  const dropped: string[] = [];
  const entries = raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.entries(raw as Record<string, unknown>)
    : [];

  for (const [key, value] of entries) {
    const candidate = value && typeof value === "object" && !Array.isArray(value)
      ? { name: key, ...(value as Record<string, unknown>) }
      : { name: key };
    const verdict = validateSavedAgent(candidate);
    if (verdict.ok) agents.push(verdict.agent);
    else dropped.push(key);
  }
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return { agents, dropped };
}

/** The list back to its stored form (name as key — the file is browsed by name). */
export function serializeAgentRegistry(agents: readonly SavedAgent[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of [...agents].sort((x, y) => x.name.localeCompare(y.name))) {
    out[a.name] = { role: a.role, goal: a.goal, tools: a.tools };
  }
  return out;
}

/** Upsert. Returns the new list plus whether an existing definition was replaced. */
export function upsertAgent(
  agents: readonly SavedAgent[],
  agent: SavedAgent,
): { agents: SavedAgent[]; replaced: boolean } {
  const rest = agents.filter((a) => a.name !== agent.name);
  return { agents: [...rest, agent], replaced: rest.length !== agents.length };
}

/** Remove by name. `removed` false when there was nothing to remove. */
export function removeAgent(
  agents: readonly SavedAgent[],
  name: string,
): { agents: SavedAgent[]; removed: boolean } {
  const key = String(name ?? "").trim().toLowerCase();
  const rest = agents.filter((a) => a.name !== key);
  return { agents: rest, removed: rest.length !== agents.length };
}

/**
 * The rows `/agents` prints: the built-in crews first, then the saved agents.
 *
 * Crews come first because they are what actually runs today, and they are marked
 * read-only so nobody tries `/agents remove code-review` and wonders why the crew
 * is still there. A saved agent whose name shadows a crew is flagged: the crew wins
 * at dispatch, so the definition would sit there doing nothing.
 */
export function describeAgentRows(
  crews: readonly string[],
  agents: readonly SavedAgent[],
): Array<{ name: string; kind: string; detail: string }> {
  const crewNames = new Set(crews.map((c) => c.toLowerCase()));
  const rows = [...crews].sort().map((c) => ({
    name: c,
    kind: "crew (built-in)",
    detail: "discovered in crews/ — read-only here",
  }));
  for (const a of agents) {
    rows.push({
      name: a.name,
      kind: "saved agent",
      detail: crewNames.has(a.name.toLowerCase())
        ? `⚠ shadowed by the crew of the same name — never dispatched. ${a.role}`
        : `${a.role} — ${a.goal}${a.tools.length > 0 ? ` [tools: ${a.tools.join(", ")}]` : ""}`,
    });
  }
  return rows;
}
