// /config (E-1, schema + persistence in B-6) — read/write settings over a
// DECLARED key space, in two layers (baseline 04 §/config).
//
// Before B-6 this was a free-form session map: any key was accepted, a typo was
// stored and never read, and nothing survived /clear. That mattered as
// soon as B-2 added `permissions.fallback`, a key whose job is to state the
// session's permission posture — `/config set permissions.fallbck bypass…`
// reported success and changed nothing.
//
//   file    /workspace/.orkeon/config.json   survives everything
//   session state bag                        overrides the file until /clear

import {
  CONFIG_KEYS, configKeySpec, knownConfigKeys, resolveConfigEntry, validateConfigEntry,
} from "../../../shared/domain/config-schema.ts";
import { CONFIG_FILE_PATH, USER_CONFIG_FILE_PATH } from "../../../shared/application/config-store.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { readLlmProfile } from "../../../shared/application/llm-profile.ts";
import type { ReasoningReader } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { storedEffortWarning } from "./effort.ts";
import type { CommandView } from "../view.ts";
import { CONFIG_GET_USAGE, CONFIG_UNSET_USAGE, CONFIG_USAGE, KEYS_NOTE, configFileLine, configFileMalformed, fileValueSet, keyNotInFile, keyRemoved, keyUnset, keyValue, nestedKeys, noSessionOverride, refusingToOverwrite, refusingUnparsed, sessionOverrideRemoved, sessionValueSet, unknownStoredKeys, userSettingsUnparsed, valueIgnored } from "./messages.ts";
import { unknownConfigKey } from "../../../shared/domain/messages.ts";

export interface ConfigDeps {
  config: ConfigStore;
  /** Where the effort /effort stored is read, once `llm.profile` changed. */
  session?: Pick<SessionIo, "readState">;
  /** What the profile the turns now run on makes of that effort; absent: nothing is said of it. */
  reasoning?: ReasoningReader;
}

/** `--session` selects the session layer; the default is the persisted file. */
function takeSessionFlag(tokens: string[]): { session: boolean; rest: string[] } {
  const rest = tokens.filter((t) => t !== "--session");
  return { session: rest.length !== tokens.length, rest };
}

/** `/config [list|keys|get|set|unset] …`, from the command's raw tokens. A set or an unset that changes the
 *  session's `llm.profile` moves its turns onto another model: the answer then warns, as /model does, when the
 *  effort /effort stored does not go as asked there. */
export async function runConfig(tokens: string[], deps: ConfigDeps): Promise<CommandView> {
  const { session, reasoning, config } = deps;
  if (session === undefined || reasoning === undefined) return applyConfig(tokens, deps);
  const before = (await readLlmProfile(config)).profile;
  const view = await applyConfig(tokens, deps);
  if ((await readLlmProfile(config)).profile === before || view.text === undefined) return view;
  const warning = await storedEffortWarning({ session, config, reasoning });
  return warning === "" ? view : { ...view, text: `${view.text}\n${warning}` };
}

async function applyConfig(tokens: string[], deps: ConfigDeps): Promise<CommandView> {
  const { config } = deps;
  const { session: useSession, rest } = takeSessionFlag(tokens);
  const [sub, key, ...valueParts] = rest;

  switch ((sub ?? "list").toLowerCase()) {
    case "list": {
      const view = await config.readView();
      const notes: string[] = [configFileLine(CONFIG_FILE_PATH)];
      if (view.unknown.length > 0) notes.push(unknownStoredKeys(view.unknown));
      if (view.nested.length > 0) notes.push(nestedKeys(view.nested));
      if (view.fileMalformed) notes.push(configFileMalformed(CONFIG_FILE_PATH));
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
        text: KEYS_NOTE,
      };

    case "get": {
      if (!key) return { text: CONFIG_GET_USAGE };
      const spec = configKeySpec(key);
      if (!spec) return { text: unknownConfigKey(key, knownConfigKeys()) };
      const view = await config.readView();
      const entry = view.entries.find((e) => e.key === key)!;
      return {
        text: entry.value === undefined
          ? keyUnset(key, spec.description)
          : keyValue(key, entry.value, entry.source),
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
        return { text: sessionValueSet(key, value) };
      }
      const { map, malformed } = await config.readFile();
      if (malformed) {
        return { text: refusingToOverwrite(CONFIG_FILE_PATH) };
      }
      map[key] = value;
      await config.writeFile(map);
      const persisted = fileValueSet(key, value, CONFIG_FILE_PATH);
      // A project file widens nothing past the user settings (LI-6): the value is kept, and said to be set aside.
      const { map: user, malformed: userMalformed } = await config.readUserFile();
      const { ignored } = resolveConfigEntry(key, map, {}, user);
      if (ignored === undefined) return { text: persisted };
      const unread = userMalformed ? userSettingsUnparsed(USER_CONFIG_FILE_PATH) : "";
      return { text: valueIgnored(persisted, ignored.value, ignored.reason, unread) };
    }

    case "unset": {
      if (!key) return { text: CONFIG_UNSET_USAGE };
      if (useSession) {
        const map = await config.readSession();
        if (!(key in map)) return { text: noSessionOverride(key) };
        delete map[key];
        await config.writeSession(map);
        return { text: sessionOverrideRemoved(key) };
      }
      const { map, malformed } = await config.readFile();
      if (malformed) return { text: refusingUnparsed(CONFIG_FILE_PATH) };
      if (!(key in map)) return { text: keyNotInFile(key, CONFIG_FILE_PATH) };
      delete map[key];
      await config.writeFile(map);
      return { text: keyRemoved(key, CONFIG_FILE_PATH) };
    }

    default:
      return { text: CONFIG_USAGE };
  }
}
