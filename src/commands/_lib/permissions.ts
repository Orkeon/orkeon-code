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
// (Orkeon:Security:PermissionGate:Enabled); the host says whether it did
// (PermissionRules.enabled, Orkeon #128) and the view reports it: on, off, or
// unknown on a runtime without the field.

import type { PermissionRules, ToolCatalogue } from "../../shared/application/ports.ts";
import { USER_CONFIG_FILE_PATH } from "../../shared/application/config-store.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import type { SessionIo } from "../../shared/application/session-io.ts";
import { configuredNames, resolveExtraTools } from "../../shared/application/extra-tools.ts";
import type { ExtraToolsResolution } from "../../shared/application/extra-tools.ts";
import {
  addPermissionRule, clearPermissionRules, readPermissionRules, removePermissionRule, syncPermissionRules,
} from "../../shared/application/permission-rules.ts";
import type { StoredRules } from "../../shared/application/permission-rules.ts";
import { PERMISSION_FALLBACK_CONFIG_KEY, PERMISSION_MODES } from "../../shared/domain/permission-modes.ts";
import { EXTRA_TOOLS_CONFIG_KEY } from "../../shared/domain/agent-policy/extra-tools.ts";
import {
  catalogueFor, checkRule, formatRule, gateLine, isReadOnly, readRule, sameCalls, toolsetFor, RULE_SYNTAX,
  ACT_TOOLS,
  MEMORY_TOOLS,
  RULEABLE_TOOLS,
  scriptToolAccess,
  scriptToolsFor,
} from "../../shared/domain/agent-policy/permission.ts";
import type { ExtraTool, PermissionRule } from "../../shared/domain/agent-policy/permission.ts";
import { heldRuleSets } from "../../shared/domain/agent-policy/rule-sets.ts";
import { nestedConfigKeys } from "../../shared/domain/config-schema.ts";
import type { CommandView } from "./view.ts";

export const PERMISSIONS_USAGE =
  `usage: /permissions [show] | add ${RULE_SYNTAX} | remove ${RULE_SYNTAX} | list | clear`;

/** Said when the host keeps no session rules: a rule is stored, nothing enforces it. */
const NO_GATE_RULES =
  "⚠ the host keeps no session rules (orkeon-repl does): the gate decides each call from the mode alone.";

export interface PermissionsDeps {
  session: Pick<SessionIo, "readDefaultPermissionMode" | "resolveSessionFallbackMode" | "readState" | "writeState">;
  gate: PermissionRules;
  /** Reads `tools.extra`, the extra tools a rule may name, and what the project file
   *  could not widen (QL-06). */
  config: Pick<ConfigStore, "readValue" | "readFile" | "readUserFile">;
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

/** What the project file set and could not widen (QL-06), and user settings that could not be read. */
async function widenedNotes(config: PermissionsDeps["config"]): Promise<{ fallback: string[]; notes: string[] }> {
  const [fallback, extra, user, project] = await Promise.all([
    config.readValue(PERMISSION_FALLBACK_CONFIG_KEY).catch(() => undefined),
    config.readValue(EXTRA_TOOLS_CONFIG_KEY).catch(() => undefined),
    config.readUserFile().catch(() => ({ malformed: true, map: {} })),
    config.readFile().catch(() => ({ map: {} })),
  ]);
  const nested = [...new Set([project.map, user.map].flatMap(nestedConfigKeys))]
    .filter((key) => key === PERMISSION_FALLBACK_CONFIG_KEY || key === EXTRA_TOOLS_CONFIG_KEY);
  return {
    fallback: fallback?.ignored === undefined
      ? []
      : [`  ↳ ignored          : the project file sets ${PERMISSION_FALLBACK_CONFIG_KEY} '${fallback.ignored.value}': ` +
        fallback.ignored.reason],
    notes: [
      ...(user.malformed
        ? [`⚠ the user settings (${USER_CONFIG_FILE_PATH}) could not be read or parsed: no user setting applies.`]
        : []),
      ...nested.map((key) =>
        `⚠ ${key} is written nested in a settings file ({"${key.split(".")[0]}": {…}}), so nothing reads it: ` +
        `write it flat, "${key}": ….`),
      ...(extra?.ignored === undefined
        ? []
        : [`⚠ ${EXTRA_TOOLS_CONFIG_KEY} of the project file names ${extra.ignored.value}, which ${extra.ignored.reason}: ` +
          "not offered."]),
    ],
  };
}

/** The effective surface: mode, catalogue, rules and what the gate holds. */
async function renderShow(deps: PermissionsDeps, extras: ExtraToolsResolution): Promise<string> {
  const { session, gate } = deps;
  const sessionDefault = await session.readDefaultPermissionMode();
  const fallback = await session.resolveSessionFallbackMode();
  const mode = sessionDefault ?? fallback.mode;
  const widened = await widenedNotes(deps.config);
  const stored = await readPermissionRules(session, configuredNames(extras));
  const { rules } = stored;
  const decision = catalogueFor(mode, rules, extras.present);
  const held = gate.available() ? gate.list() : null;
  const gateOn = gate.enabled();
  // What the gate holds beyond the session's rules is grouped by built-in rule set (a dev step's).
  const sessionLines = rules.map(gateLine);
  const grouped = held === null ? null : heldRuleSets(held.filter((l) => !sessionLines.includes(l)));
  const setLines = new Set(held === null || grouped === null
    ? []
    : held.filter((l) => !sessionLines.includes(l) && !grouped.rest.includes(l)));
  const plain = held === null ? null : held.filter((l) => !setLines.has(l));
  const setParts = grouped !== null && grouped.sets.length > 0
    ? [`rule sets of the last dev step: ${grouped.sets.map((g) => `${g.id} (${g.count} rules)`).join(", ")}`]
    : [];
  const heldParts = plain === null ? [] : [...(plain.length > 0 ? [plain.join(", ")] : []), ...setParts];

  // The shared memory's tools are the main loop's, offered by mode (memory_recall always, memory_push where the
  // mode edits) less a deny rule on the whole tool; Orkeon Code's other tools (SCRIPT_TOOLS) belong to the dev
  // crews that attach them, never to the session.
  const memoryByMode = scriptToolsFor(mode, MEMORY_TOOLS);
  const memory = scriptToolsFor(mode, MEMORY_TOOLS, rules);
  const offered = [...toolsetFor(mode, extras.present), ...memoryByMode];
  // The host offers the ACT_TOOLS to every act, and its gate refuses them in the read-only modes only.
  const withheld = (t: string) => MEMORY_TOOLS.includes(t)
    || ((isReadOnly(mode) || !ACT_TOOLS.includes(t)) && scriptToolAccess(t) === undefined);
  const vocabulary = [...RULEABLE_TOOLS.filter(withheld), ...extras.present.map((t) => t.name)];
  const lines = [
    `session default mode : ${mode} ${isReadOnly(mode) ? "(read-only)" : ""}`,
    `  ↳ source           : ${sessionDefault ? "set by /mode (session state)" : fallback.explanation}`,
    ...widened.fallback,
    `modes                : ${PERMISSION_MODES.join(", ")} (bare /mode cycles)`,
    `tool catalogue       : ${[...decision.tools, ...memory].join(", ") || "(empty)"}`,
    `  ↳ withheld by mode : ${vocabulary.filter((t) => !offered.includes(t)).join(", ") || "(none)"}`,
    `  ↳ removed by rule  : ${[...decision.deniedByRule, ...memoryByMode.filter((t) => !memory.includes(t))].join(", ") || "(none)"}`,
    ...(extras.present.length + extras.missing.length + extras.invalid.length > 0
      ? [
        `  ↳ extra tools      : ${extras.present.map(describeExtra).join(", ") || "(none registered)"}` +
          (extras.missing.length > 0 ? `; not registered: ${extras.missing.map(describeExtra).join(", ")}` : "") +
          (extras.invalid.length > 0 ? `; ignored: ${extras.invalid.join(", ")}` : ""),
      ]
      : []),
    `session rules        : ${rules.map(formatRule).join(", ") || "(none)"}` +
      (stored.dormant.length > 0 ? `; dormant: ${stored.dormant.join(", ")}` : ""),
    `in the host gate     : ${plain === null ? "(the host keeps no session rules)" : heldParts.join("; ") || "(none)"}`,
    "enforcement          : 1) catalogue: what the mode offers, less the tools a deny rule covers whole",
    "                       2) host gate, at each call: a matching deny refuses; a matching allow runs",
    "                          without asking (not in plan); else the mode decides, and default and",
    "                          acceptEdits ask you: [y] once / [s] session / [n] no",
    "                       3) dev crews' callback (/dev-plan, /dev-verify), after the gate allowed a call:",
    "                          the step's rule sets and a role's roots again, glob/grep/count_pattern by",
    "                          their whole input, the act's mode when the host has no gate, then the",
    "                          pre-tool and post-tool hooks (/hooks); it can refuse, never allow more",
    ...gateStateLines(gateOn),
  ];

  for (const r of decision.inert) {
    lines.push(`⚠ rule ${formatRule(r.rule)} has NO effect in '${mode}': ${r.reason}`);
  }
  if (plain !== null && plain.join("\n") !== sessionLines.join("\n")) {
    lines.push("⚠ the gate holds other rules than the session: the next change or /assistant hands it these.");
  } else if (setParts.length > 0) {
    lines.push(
      "⚠ the gate also holds the rule sets of the last dev step: the next /assistant turn or rule change hands it the session's rules alone.",
    );
  }
  lines.push(...widened.notes, ...storedNotes(stored, extras));
  return lines.join("\n");
}

/** The closing lines of the enforcement block: what the host says of its gate. */
function gateStateLines(on: boolean | undefined): string[] {
  if (on === true) {
    return [
      "                       the gate is on (Orkeon:Security:PermissionGate:Enabled, the host says): the rules",
      "                       and the modes above hold at each call",
    ];
  }
  if (on === false) {
    return [
      "⚠ the gate is OFF (Orkeon:Security:PermissionGate:Enabled is not true, the host says): no rule above",
      "                       is enforced and nothing asks",
    ];
  }
  return [
    "                       the gate runs only when Orkeon:Security:PermissionGate:Enabled is true, which",
    "                       the launcher sets: off, no rule above is enforced and nothing asks",
  ];
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
