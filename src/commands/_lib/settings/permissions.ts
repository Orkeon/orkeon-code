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
// (PermissionRules.enabled, Orkeon #128, which the runtime always reports) and the
// view says on or off. The last case of gateStateLines - no value - is for a fake
// or a port that says nothing: it names the setting and the launcher instead.

import type { PermissionRules, ToolCatalogue } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { configuredNames, resolveExtraTools } from "../../../shared/application/extra-tools.ts";
import type { ExtraToolsResolution } from "../../../shared/application/extra-tools.ts";
import {
  addPermissionRule, builtInRules, clearPermissionRules, readPermissionRules, removePermissionRule, syncPermissionRules,
} from "../../../shared/application/permission-rules.ts";
import { listsOf } from "../../../shared/application/host-context.ts";
import type { HostSource } from "../../../shared/application/host-context.ts";
import {
  USER_CONFIG_MOUNT, listedEntries, pathListRules, userConfigRules,
} from "../../../shared/domain/agent-policy/path-rules.ts";
import type { StoredRules } from "../../../shared/application/permission-rules.ts";
import { readMemoryDir } from "../../../shared/application/shared-memory/memory-settings.ts";
import { memoryWriteRules } from "../../../shared/domain/shared-memory/layout.ts";
import { PERMISSION_FALLBACK_CONFIG_KEY, PERMISSION_MODES } from "../../../shared/domain/permission-modes.ts";
import { EXTRA_TOOLS_CONFIG_KEY } from "../../../shared/domain/agent-policy/extra-tools.ts";
import {
  catalogueFor, checkRule, formatRule, gateLine, isReadOnly, readRule, sameCalls, toolsetFor,
  ACT_TOOLS,
  MEMORY_TOOLS,
  RULEABLE_TOOLS,
  scriptToolAccess,
  scriptToolsFor,
} from "../../../shared/domain/agent-policy/permission.ts";
import type { ExtraTool, PermissionRule } from "../../../shared/domain/agent-policy/permission.ts";
import { heldRuleSets } from "../../../shared/domain/agent-policy/rule-sets.ts";
import { nestedConfigKeys } from "../../../shared/domain/config-schema.ts";
import type { CommandView } from "../view.ts";
import {
  ALL_RULES_CLEARED, DORMANT_NOT_LISTED, ENFORCEMENT_LINES, EVERY_CALL, GATE_HOLDS_OTHER_RULES, GATE_HOLDS_RULE_SETS,
  GATE_OFF_LINES, GATE_ON_LINES, GATE_UNKNOWN_LINES, HOST_KEEPS_NO_RULES, INVALID_RULE_GRAMMAR, NO_GATE_RULES,
  NO_PERMISSION_RULES, PERMISSIONS_USAGE, SET_BY_MODE, USER_SETTINGS_UNREADABLE, catalogueOfMode, dormantRule,
  extraToolIgnored, extraToolsUnreadable, fallbackIgnored, inertRule, invalidRule, invalidStoredEntries, memoryGuard,
  modesLine, nestedKey, noSuchRule, pathsDenyGuard, ruleAdded, ruleNoEffect, ruleRemoved, ruleSetsOfLastStep,
  userConfigGuard, sessionDefaultLine, sourceLine, toolCatalogueLine, withheldLine, removedLine, extraToolsLine,
  sessionRulesLine, hostGateLine,
} from "./messages.ts";

export interface PermissionsDeps {
  session: Pick<SessionIo, "readDefaultPermissionMode" | "resolveSessionFallbackMode" | "readState" | "writeState">;
  gate: PermissionRules;
  /** Reads `tools.extra`, the extra tools a rule may name, and what the project file
   *  could not widen (QL-06). */
  config: Pick<ConfigStore, "readValue" | "readFile" | "readUserFile">;
  /** The tools the host registers: the catalogue offers the extra tools it has. */
  catalogue: Pick<ToolCatalogue, "find">;
  /** This run's host context, for its path lists (paths.deny in the gate); absent: no list. */
  host?: HostSource;
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
  return rule.argument === undefined ? EVERY_CALL : `${rule.argument}=${rule.pattern}`;
}

/** What the stored rules hold that the gate does not get, and a setting that could not be read. */
function storedNotes(stored: StoredRules, extras: ExtraToolsResolution): string[] {
  return [
    ...(extras.unreadable === undefined
      ? []
      : [extraToolsUnreadable(extras.unreadable)]),
    ...stored.dormant.map(dormantRule),
    ...(stored.invalid.length > 0 ? [invalidStoredEntries(stored.invalid)] : []),
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
      : [fallbackIgnored(fallback.ignored.value, fallback.ignored.reason)],
    notes: [
      ...(user.malformed ? [USER_SETTINGS_UNREADABLE] : []),
      ...nested.map(nestedKey),
      ...(extra?.ignored === undefined ? [] : [extraToolIgnored(extra.ignored.value, extra.ignored.reason)]),
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
  const gateOn = gate.enabled();
  // What the gate holds beyond the session's rules: the shared memory's guard every sync adds, then the
  // built-in rule sets (a dev step's), grouped.
  const sessionLines = rules.map(gateLine);
  const memoryDir = (await readMemoryDir(deps.config)).dir;
  const lists = await listsOf(deps.host);
  const memoryLines = memoryWriteRules(memoryDir).map(gateLine);
  const userConfigLines = userConfigRules().map(gateLine);
  const pathLines = pathListRules(lists).map(gateLine);
  const builtInLines = [...memoryLines, ...userConfigLines, ...pathLines];
  const all = gate.available() ? gate.list() : null;
  const guarded = all === null ? [] : all.filter((l) => builtInLines.includes(l) && !sessionLines.includes(l));
  const guardedOf = (lines: string[]): number => guarded.filter((l) => lines.includes(l)).length;
  const held = all === null ? null : all.filter((l) => !guarded.includes(l));
  const grouped = held === null ? null : heldRuleSets(held.filter((l) => !sessionLines.includes(l)));
  const setLines = new Set(held === null || grouped === null
    ? []
    : held.filter((l) => !sessionLines.includes(l) && !grouped.rest.includes(l)));
  const plain = held === null ? null : held.filter((l) => !setLines.has(l));
  const setParts = grouped !== null && grouped.sets.length > 0
    ? [ruleSetsOfLastStep(grouped.sets.map((g) => `${g.id} (${g.count} rules)`).join(", "))]
    : [];
  const guardParts = [
    ...(guardedOf(memoryLines) > 0
      ? [memoryGuard(memoryDir, guardedOf(memoryLines))]
      : []),
    ...(guardedOf(userConfigLines) > 0
      ? [userConfigGuard(USER_CONFIG_MOUNT, guardedOf(userConfigLines))]
      : []),
    ...(guardedOf(pathLines) > 0
      ? [pathsDenyGuard(listedEntries(lists.deny).join(", "), guardedOf(pathLines))]
      : []),
  ];
  const heldParts = plain === null ? [] : [...(plain.length > 0 ? [plain.join(", ")] : []), ...setParts, ...guardParts];

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
    sessionDefaultLine(mode, isReadOnly(mode)),
    sourceLine(sessionDefault ? SET_BY_MODE : fallback.explanation),
    ...widened.fallback,
    modesLine(PERMISSION_MODES.join(", ")),
    toolCatalogueLine([...decision.tools, ...memory].join(", ")),
    withheldLine(vocabulary.filter((t) => !offered.includes(t)).join(", ")),
    removedLine([...decision.deniedByRule, ...memoryByMode.filter((t) => !memory.includes(t))].join(", ")),
    ...(extras.present.length + extras.missing.length + extras.invalid.length > 0
      ? [extraToolsLine(extras.present.map(describeExtra).join(", "), extras.missing.map(describeExtra), extras.invalid)]
      : []),
    sessionRulesLine(rules.map(formatRule).join(", "), stored.dormant),
    plain === null ? hostGateLine(HOST_KEEPS_NO_RULES) : hostGateLine(heldParts.join("; ")),
    ...ENFORCEMENT_LINES,
    ...gateStateLines(gateOn),
  ];

  for (const r of decision.inert) {
    lines.push(inertRule(formatRule(r.rule), mode, r.reason));
  }
  if (plain !== null && plain.join("\n") !== sessionLines.join("\n")) {
    lines.push(GATE_HOLDS_OTHER_RULES);
  } else if (setParts.length > 0) {
    lines.push(GATE_HOLDS_RULE_SETS);
  }
  lines.push(...widened.notes, ...storedNotes(stored, extras));
  return lines.join("\n");
}

/** The closing lines of the enforcement block: what the host says of its gate. */
function gateStateLines(on: boolean | undefined): string[] {
  if (on === true) return [...GATE_ON_LINES];
  if (on === false) return [...GATE_OFF_LINES];
  return [...GATE_UNKNOWN_LINES];
}

/** `/permissions [show|list|add|remove|clear] …`, from the command's raw tokens. */
export async function runPermissions(tokens: string[], deps: PermissionsDeps): Promise<CommandView> {
  const { session, gate } = deps;
  const [sub, ...ruleTokens] = tokens;
  const ruleText = ruleTokens.join(" ");
  const extras = await resolveExtraTools(deps);
  const extraNames = configuredNames(extras);
  const builtIn = builtInRules((await readMemoryDir(deps.config)).dir, await listsOf(deps.host));
  const sync = () => syncPermissionRules({ session, gate, extraNames, builtIn });
  switch ((sub ?? "show").toLowerCase()) {
    case "show":
      return { text: await renderShow(deps, extras) };

    case "list": {
      const stored = await readPermissionRules(session, extraNames);
      const dormant = stored.dormant.map(readRule).filter((r): r is PermissionRule => r !== null);
      if (stored.rules.length + dormant.length === 0) {
        return { text: [NO_PERMISSION_RULES, ...storedNotes(stored, extras)].join("\n") };
      }
      const notes = storedNotes({ ...stored, dormant: [] }, extras);
      return {
        table: [
          ...stored.rules.map((r) => ({ effect: r.effect, tool: r.tool, calls: callsOf(r), state: "enforced" })),
          ...dormant.map((r) => ({
            effect: r.effect, tool: r.tool, calls: callsOf(r), state: DORMANT_NOT_LISTED,
          })),
        ],
        text: notes.length > 0 ? notes.join("\n") : undefined,
      };
    }

    case "add": {
      const check = checkRule(ruleText, extraNames);
      if (!check.ok) return { text: invalidRule(check.reason) };
      const { rule } = check;
      await addPermissionRule(session, rule);
      const synced = await sync();
      const mode = await sessionMode(session);
      const decision = catalogueFor(mode, synced.rules, extras.present);
      const inert = decision.inert.find((r) => r.rule.effect === rule.effect && sameCalls(r.rule, rule));
      return {
        text: [
          ruleAdded(formatRule(rule)),
          ...(check.warning ? [`⚠ ${check.warning}`] : []),
          ...(inert ? [ruleNoEffect(mode, inert.reason)] : []),
          catalogueOfMode(mode, decision.tools.join(", ") || "(empty)"),
          ...syncNotes(synced, extras),
        ].join("\n"),
      };
    }

    case "remove": {
      // Read by the grammar alone: a dormant rule, whose tool is not known now, is removed too.
      const rule = readRule(ruleText);
      if (!rule) return { text: INVALID_RULE_GRAMMAR };
      const removed = await removePermissionRule(session, rule);
      if (removed.length === 0) return { text: noSuchRule(formatRule(rule)) };
      const synced = await sync();
      return { text: [ruleRemoved(formatRule(removed[0])), ...syncNotes(synced, extras)].join("\n") };
    }

    case "clear": {
      await clearPermissionRules(session);
      const synced = await sync();
      return {
        text: [ALL_RULES_CLEARED, ...syncNotes(synced, extras)].join("\n"),
      };
    }

    default:
      return { text: PERMISSIONS_USAGE };
  }
}
