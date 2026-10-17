// /config (E-1, schema + persistence in B-6) — read/write settings over a
// DECLARED key space, in two layers (baseline 04 §/config).
//
// Before B-6 this was a free-form session map: any key was accepted, a typo was
// stored and never read, and nothing survived /reset-session. That mattered as
// soon as B-2 added `permissions.fallback`, a key whose job is to state the
// session's permission posture — `/config set permissions.fallbck bypass…`
// reported success and changed nothing.
//
//   file    /workspace/.orkeon/config.json   survives everything
//   session state bag                        overrides the file until /reset-session

import {
  CONFIG_KEYS, configKeySpec, knownConfigKeys, validateConfigEntry,
} from "../../shared/domain/config-schema.ts";
import { CONFIG_FILE_PATH } from "../../shared/application/config-store.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import type { CommandView } from "./view.ts";

export const CONFIG_USAGE =
  "usage: /config [list|keys|get <key>|set [--session] <key> <value>|unset [--session] <key>]";

export interface ConfigDeps {
  config: ConfigStore;
}

/** `--session` selects the session layer; the default is the persisted file. */
function takeSessionFlag(tokens: string[]): { session: boolean; rest: string[] } {
  const rest = tokens.filter((t) => t !== "--session");
  return { session: rest.length !== tokens.length, rest };
}

/** `/config [list|keys|get|set|unset] …`, from the command's raw tokens. */
export async function runConfig(tokens: string[], deps: ConfigDeps): Promise<CommandView> {
  const { config } = deps;
  const { session: useSession, rest } = takeSessionFlag(tokens);
  const [sub, key, ...valueParts] = rest;

  switch ((sub ?? "list").toLowerCase()) {
    case "list": {
      const view = await config.readView();
      const notes: string[] = [`file: ${CONFIG_FILE_PATH} — session overrides it until /reset-session.`];
      if (view.unknown.length > 0) {
        notes.push(
          `⚠ stored but NOT in the key space (pre-B-6 residue, nothing reads them): ${view.unknown.join(", ")}`,
        );
      }
      if (view.fileMalformed) {
        notes.push(`⚠ ${CONFIG_FILE_PATH} could not be parsed — it is left untouched; fix or delete it.`);
      }
      return {
        table: view.entries.map((e) => ({ key: e.key, value: e.value ?? "(unset)", source: e.source })),
        text: notes.join("\n"),
      };
    }

    case "keys":
      return {
        table: CONFIG_KEYS.map((s) => ({
          key: s.key,
          allowed: s.allowed ? s.allowed.join(" | ") : "(any)",
          "read by": s.consumedBy,
        })),
        text: "every key names its consumer — a key nothing reads is not settable.",
      };

    case "get": {
      if (!key) return { text: "usage: /config get <key>" };
      const spec = configKeySpec(key);
      if (!spec) return { text: `unknown config key '${key}'. Valid keys: ${knownConfigKeys().join(", ")}` };
      const view = await config.readView();
      const entry = view.entries.find((e) => e.key === key)!;
      return {
        text: entry.value === undefined
          ? `${key} is unset (${spec.description})`
          : `${key} = ${entry.value}  [${entry.source}]`,
      };
    }

    case "set": {
      const value = valueParts.join(" ");
      // ACCEPTANCE 1: an unknown key is refused WITH the list.
      const verdict = validateConfigEntry(key, value);
      if (!verdict.ok) return { text: verdict.reason };

      if (useSession) {
        const map = await config.readSession();
        map[key] = value;
        await config.writeSession(map);
        return { text: `${key} = ${value} [session] — overrides the file until /reset-session.` };
      }
      const { map, malformed } = await config.readFile();
      if (malformed) {
        return {
          text: `refusing to write: ${CONFIG_FILE_PATH} exists but could not be parsed, and overwriting it ` +
            "would discard whatever it holds. Fix or delete it, then retry.",
        };
      }
      map[key] = value;
      await config.writeFile(map);
      return { text: `${key} = ${value} [file] — persisted in ${CONFIG_FILE_PATH}.` };
    }

    case "unset": {
      if (!key) return { text: "usage: /config unset [--session] <key>" };
      if (useSession) {
        const map = await config.readSession();
        if (!(key in map)) return { text: `${key} has no session override.` };
        delete map[key];
        await config.writeSession(map);
        return { text: `${key} session override removed (the file value applies again).` };
      }
      const { map, malformed } = await config.readFile();
      if (malformed) return { text: `refusing to write: ${CONFIG_FILE_PATH} could not be parsed.` };
      if (!(key in map)) return { text: `${key} is not set in ${CONFIG_FILE_PATH}.` };
      delete map[key];
      await config.writeFile(map);
      return { text: `${key} removed from ${CONFIG_FILE_PATH}.` };
    }

    default:
      return { text: CONFIG_USAGE };
  }
}
