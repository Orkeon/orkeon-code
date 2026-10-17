// /permissions — display the effective permission surface and manage the
// session's allow/deny rules.
//
// The rules live in the session state bag and the host's permission gate
// enforces them at each tool call (shared/application/permission-rules.ts): every
// change is written to the bag, then the gate is cleared and handed the whole
// list again, as it has no per-rule removal. A rule names a tool, and optionally
// an argument pattern: `allow shell_command command=npm test*`. The catalogue
// reads one kind of rule only — a deny covering every call of a tool removes the
// tool (agent-policy/permission.ts). A rule may name a built-in tool or one of
// the extra tools of `tools.extra`, registered by the host or not; a stored rule
// whose tool `tools.extra` no longer lists stays, dormant, until it lists it again
// or the rule is removed. The gate itself runs only when the host turned it on
// (Orkeon:Security:PermissionGate:Enabled), which a script cannot see: the view
// says so.

import type { PermissionRules, ToolCatalogue } from "../../shared/application/ports.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import type { SessionIo } from "../../shared/application/session-io.ts";
import { configuredNames, resolveExtraTools } from "../../shared/application/extra-tools.ts";
import type { ExtraToolsResolution } from "../../shared/application/extra-tools.ts";
import {
  addPermissionRule, clearPermissionRules, readPermissionRules, removePermissionRule, syncPermissionRules,
} from "../../shared/application/permission-rules.ts";
import type { StoredRules } from "../../shared/application/permission-rules.ts";
import { PERMISSION_MODES } from "../../shared/domain/permission-modes.ts";
import { EXTRA_TOOLS_CONFIG_KEY } from "../../shared/domain/agent-policy/extra-tools.ts";
import {
  catalogueFor, checkRule, formatRule, gateLine, isReadOnly, readRule, sameCalls, toolsetFor, RULE_SYNTAX,
  RULEABLE_TOOLS,
} from "../../shared/domain/agent-policy/permission.ts";
import type { ExtraTool, PermissionRule } from "../../shared/domain/agent-policy/permission.ts";
import type { CommandView } from "./view.ts";

export const PERMISSIONS_USAGE =
  `usage: /permissions [show] | add ${RULE_SYNTAX} | remove ${RULE_SYNTAX} | list | clear`;

/** Said when the host keeps no session rules: a rule is stored, nothing enforces it. */
const NO_GATE_RULES =
  "⚠ the host keeps no session rules (orkeon-repl does): the gate decides each call from the mode alone.";

export interface PermissionsDeps {
  session: Pick<SessionIo, "readDefaultPermissionMode" | "resolveSessionFallbackMode" | "readState" | "writeState">;
  gate: PermissionRules;
  /** Reads `tools.extra`, the extra tools a rule may name. */
  config: Pick<ConfigStore, "readValue" | "readFile">;
  /** The tools the host registers: the catalogue offers the extra tools it has. */
  catalogue: Pick<ToolCatalogue, "find">;
}

/** The mode a turn without a `mode:` prefix runs in: /mode's, else the fallback. */
async function sessionMode(session: PermissionsDeps["session"]): Promise<string> {
  return (await session.readDefaultPermissionMode()) ?? (await session.resolveSessionFallbackMode()).mode;
}

/** An extra tool as `/permissions` shows it: `search_issues (write)`. */
function describeExtra(tool: ExtraTool): string {
  return `${tool.name} (${tool.access})`;
}

/** The scope of a rule, for the `list` table. */
function callsOf(rule: PermissionRule): string {
  return rule.argument === undefined ? "every call" : `${rule.argument}=${rule.pattern}`;
}

/** What the stored rules hold that the gate does not get, and a setting that could not be read. */
function storedNotes(stored: StoredRules, extras: ExtraToolsResolution): string[] {
  return [
    ...(extras.unreadable === undefined
      ? []
      : [`⚠ ${EXTRA_TOOLS_CONFIG_KEY} could not be read (${extras.unreadable}): no extra tool is known, and the ` +
        "rules on extra tools are dormant."]),
    ...stored.dormant.map((rule) =>
      `⚠ rule ${rule} is dormant: its tool is neither built in nor listed in ${EXTRA_TOOLS_CONFIG_KEY}. It is ` +
      "kept, not handed to the gate, and applies again once the tool is listed (/permissions remove deletes it)."),
    ...(stored.invalid.length > 0
      ? [`⚠ ${stored.invalid.length} stored entr${stored.invalid.length === 1 ? "y is" : "ies are"} not a rule ` +
        `(${stored.invalid.join(", ")}): kept as written, ignored; /permissions clear removes them.`]
      : []),
  ];
}

/** What a sync must report: a gate that holds none, rules it did not get. */
function syncNotes(sync: StoredRules & { applied: boolean }, extras: ExtraToolsResolution): string[] {
  return [...(sync.applied ? [] : [NO_GATE_RULES]), ...storedNotes(sync, extras)];
}

/** The effective surface: mode, catalogue, rules and what the gate holds. */
async function renderShow(deps: PermissionsDeps, extras: ExtraToolsResolution): Promise<string> {
  const { session, gate } = deps;
  const sessionDefault = await session.readDefaultPermissionMode();
  const fallback = await session.resolveSessionFallbackMode();
  const mode = sessionDefault ?? fallback.mode;
  const stored = await readPermissionRules(session, configuredNames(extras));
  const { rules } = stored;
  const decision = catalogueFor(mode, rules, extras.present);
  const held = gate.available() ? gate.list() : null;

  const offered = toolsetFor(mode, extras.present);
  const vocabulary = [...RULEABLE_TOOLS, ...extras.present.map((t) => t.name)];
  const lines = [
    `session default mode : ${mode} ${isReadOnly(mode) ? "(read-only)" : ""}`,
    `  ↳ source           : ${sessionDefault ? "set by /mode (session state)" : fallback.explanation}`,
    `modes                : ${PERMISSION_MODES.join(", ")} (bare /mode cycles)`,
    `tool catalogue       : ${decision.tools.join(", ") || "(empty)"}`,
    `  ↳ withheld by mode : ${vocabulary.filter((t) => !offered.includes(t)).join(", ") || "(none)"}`,
    `  ↳ removed by rule  : ${decision.deniedByRule.join(", ") || "(none)"}`,
    ...(extras.present.length + extras.missing.length + extras.invalid.length > 0
      ? [
        `  ↳ extra tools      : ${extras.present.map(describeExtra).join(", ") || "(none registered)"}` +
          (extras.missing.length > 0 ? `; not registered: ${extras.missing.map(describeExtra).join(", ")}` : "") +
          (extras.invalid.length > 0 ? `; ignored: ${extras.invalid.join(", ")}` : ""),
      ]
      : []),
    `session rules        : ${rules.map(formatRule).join(", ") || "(none)"}` +
      (stored.dormant.length > 0 ? `; dormant: ${stored.dormant.join(", ")}` : ""),
    `in the host gate     : ${held === null ? "(the host keeps no session rules)" : held.join(", ") || "(none)"}`,
    "enforcement          : 1) catalogue: what the mode offers, less the tools a deny rule covers whole",
    "                       2) host gate, at each call: a matching deny refuses; a matching allow runs",
    "                          without asking (not in plan); else the mode decides, and default and",
    "                          acceptEdits ask you: [y] once / [s] session / [n] no",
    "                       the gate runs only when Orkeon:Security:PermissionGate:Enabled is true, which",
    "                       the launcher sets: off, no rule above is enforced and nothing asks",
  ];

  for (const r of decision.inert) {
    lines.push(`⚠ rule ${formatRule(r.rule)} has NO effect in '${mode}': ${r.reason}`);
  }
  if (held !== null && held.join("\n") !== rules.map(gateLine).join("\n")) {
    lines.push("⚠ the gate holds other rules than the session: the next change or /assistant hands it these.");
  }
  lines.push(...storedNotes(stored, extras));
  return lines.join("\n");
}

/** `/permissions [show|list|add|remove|clear] …`, from the command's raw tokens. */
export async function runPermissions(tokens: string[], deps: PermissionsDeps): Promise<CommandView> {
  const { session, gate } = deps;
  const [sub, ...ruleTokens] = tokens;
  const ruleText = ruleTokens.join(" ");
  const extras = await resolveExtraTools(deps);
  const extraNames = configuredNames(extras);
  const sync = () => syncPermissionRules({ session, gate, extraNames });
  switch ((sub ?? "show").toLowerCase()) {
    case "show":
      return { text: await renderShow(deps, extras) };

    case "list": {
      const stored = await readPermissionRules(session, extraNames);
      const dormant = stored.dormant.map(readRule).filter((r): r is PermissionRule => r !== null);
      if (stored.rules.length + dormant.length === 0) {
        return { text: [`no permission rules set. ${PERMISSIONS_USAGE}`, ...storedNotes(stored, extras)].join("\n") };
      }
      const notes = storedNotes({ ...stored, dormant: [] }, extras);
      return {
        table: [
          ...stored.rules.map((r) => ({ effect: r.effect, tool: r.tool, calls: callsOf(r), state: "enforced" })),
          ...dormant.map((r) => ({
            effect: r.effect, tool: r.tool, calls: callsOf(r), state: `dormant: not in ${EXTRA_TOOLS_CONFIG_KEY}`,
          })),
        ],
        text: notes.length > 0 ? notes.join("\n") : undefined,
      };
    }

    case "add": {
      const check = checkRule(ruleText, extraNames);
      if (!check.ok) return { text: `invalid rule: ${check.reason}.\n${PERMISSIONS_USAGE}` };
      const { rule } = check;
      await addPermissionRule(session, rule);
      const synced = await sync();
      const mode = await sessionMode(session);
      const decision = catalogueFor(mode, synced.rules, extras.present);
      const inert = decision.inert.find((r) => r.rule.effect === rule.effect && sameCalls(r.rule, rule));
      return {
        text: [
          `rule ${formatRule(rule)} added.`,
          ...(check.warning ? [`⚠ ${check.warning}`] : []),
          ...(inert ? [`⚠ it has NO effect in '${mode}': ${inert.reason}`] : []),
          `catalogue for '${mode}': ${decision.tools.join(", ") || "(empty)"}`,
          ...syncNotes(synced, extras),
        ].join("\n"),
      };
    }

    case "remove": {
      // Read by the grammar alone: a dormant rule, whose tool is not known now, is removed too.
      const rule = readRule(ruleText);
      if (!rule) return { text: `invalid rule: expected ${RULE_SYNTAX}.\n${PERMISSIONS_USAGE}` };
      const removed = await removePermissionRule(session, rule);
      if (removed.length === 0) return { text: `no such rule: ${formatRule(rule)}.` };
      const synced = await sync();
      return { text: [`rule ${formatRule(removed[0])} removed.`, ...syncNotes(synced, extras)].join("\n") };
    }

    case "clear": {
      await clearPermissionRules(session);
      const synced = await sync();
      return {
        text: ["all permission rules cleared (the mode decides alone).", ...syncNotes(synced, extras)].join("\n"),
      };
    }

    default:
      return { text: PERMISSIONS_USAGE };
  }
}
