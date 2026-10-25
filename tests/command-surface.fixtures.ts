// The command surface as the tests read it: every commands/<group>/*.cmd.ts, its declared name and its aliases.
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const COMMANDS_DIR = fileURLToPath(new URL("../src/commands", import.meta.url));

/** The functional folders of src/commands/ a command file sits in, one level deep. */
export const COMMAND_GROUPS: readonly string[] = ["session", "settings", "status", "project", "git", "dev", "memory", "speech"];

// 58: /dev-batches added (L-7).
// 57: /dev-implement added (L-6).
// 56: /dev-spec and /dev-change added (L-5).
// 54: /memory-admit added (M-4).
// 53: /dev-plan added (L-4).
// 52: /dev-learn added (L-3).
// 51: /dev-verify added (L-2).
// 50: /dev-status added (L-1).
// 49: twelve commands folded into others or retired, /verify added — /clear
// is an alias of /clear; /version, /env, /session and /upgrade of /status; /ctx-viz
// of /context; /extra-usage of /usage; /bughunter became `/review --lens
// correctness`, /force-snip `/compact --snip`; /tag (a /memory add), /sandbox-toggle
// (it enforced nothing) and /onboarding (the native /help) are gone. Bumping this
// deliberately: the count is the guard against a command silently failing to load,
// so it must move only with a commit that adds or removes one.
export const EXPECTED_COMMAND_COUNT = 58;

/** Orkeon's default cap on the command files the loader keeps (Orkeon:Cli:ScriptCommands:MaxScripts). */
export const LOADER_DEFAULT_CAP = 200;

export interface Cmd {
  /** The file's path under src/commands/: `<group>/<name>.cmd.ts`. */
  file: string;
  /** Every `name: "<literal>"` the file holds: exactly one is expected. */
  names: string[];
  /** The first of `names`, the command's primary name. */
  name: string;
  aliases: string[];
}

/** Every *.cmd.ts under `dir`, sorted by path. */
export function collect(dir = COMMANDS_DIR): Cmd[] {
  const out: Cmd[] = [];
  const files = readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".cmd.ts"))
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf-8");
    // Every descriptor in the codebase declares `name: "<literal>"` — factory
    // helpers (toggleCommand) pass it through a `name:` field too.
    const names = [...src.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
    const aliases = [...(src.match(/aliases:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    out.push({ file: f, names, name: names[0], aliases });
  }
  return out;
}

/** The folded commands' names, each with the command that absorbed it. */
export const FOLDED_ALIASES: readonly (readonly [alias: string, name: string])[] = [
  ["reset-session", "clear"], ["version", "status"], ["env", "status"], ["session", "status"],
  ["upgrade", "status"], ["ctx-viz", "context"], ["extra-usage", "usage"],
];

export const E1_COMMANDS: readonly string[] = [
  "clear", "exit", "config", "model", "plan", "permissions", "summary",
  "resume", "rewind", "usage", "feedback", "hooks",
  "skills", "tasks", "copy",
  "effort", "fast", "passes", "proactive", "verify",
];

export const B12_COMMANDS: readonly string[] = ["advisor", "agents", "debug-tool-call", "security-review", "output-style"];

/** The folder of a command file's path under src/commands/, "" at the root. */
export const groupOf = (file: string): string => file.includes("/") ? file.slice(0, file.indexOf("/")) : "";

/** The slug of a command file: its base name without `.cmd.ts`. */
export const slugOf = (file: string): string => basename(file, ".cmd.ts");

export interface ExportLine { line: string; n: number }

/** The lines of a command file that open with a top-level `export`, numbered from 1. */
export function topLevelExports(file: string, dir = COMMANDS_DIR): ExportLine[] {
  return readFileSync(join(dir, file), "utf-8")
    .split("\n")
    .map((line, i) => ({ line: line.trimEnd(), n: i + 1 }))
    .filter(({ line }) => /^export\b/.test(line));
}
