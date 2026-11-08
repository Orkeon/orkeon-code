// The user's path lists — pure, no IO: `paths.deny` names what the assistant may neither read nor write,
// `paths.allow` the only paths it may; both match on the canonical virtual spelling (host-paths.ts toVirtual), so a
// physical spelling of a mount's base (`C:\…`, `/mnt/c/…`, `\\wsl$\…`) or another letter case on a Windows disk
// reaches the same rule. The notation:
//
//   /workspace/secrets, C:\proj\keys\*, tests/fixtures/real
//
// entries separated by commas (a path may hold spaces), each a virtual path, a physical spelling of a mount's base,
// or a relative path under /workspace; `*` stands for any run of characters as the gate reads it; a bare path covers
// itself and everything below it. Deny wins over allow; a non-empty allow refuses every path outside it, on every
// mount. Two readers: pathListRules gives the gate the deny rules on the canonical spelling (and lists them in
// /permissions); pathListRefusal, run by the acts' callbacks on the canonicalised call, holds against every spelling,
// every case the host ignores, each operation of an edit_batch, what a folder reader reaches and the words of a
// shell command. The built-in deny of the whole /user-config mount (userConfigRules) keeps the physical bases of
// launch.json and the user settings out of the model's reach.

import { globMatches, sameToolName, shellCommandForms, shellWords } from "./permission.ts";
import type { PermissionRule } from "./permission.ts";
import {
  FOLDER_READ_TOOLS, OPERATIONS_TOOL, PATH_READ_TOOLS, PATH_WRITE_TOOLS, UNSCOPED_READ_TOOLS, UNSCOPED_WRITE_TOOLS,
  denyEach, denyWhole,
} from "./rule-sets.ts";
import { normalisePath, reachedPaths } from "../dev/call-guard.ts";
import { textToVirtual, toVirtual } from "../host-paths.ts";
import { IDENTITY_HOST } from "../host-layout.ts";
import type { HostLayout } from "../host-layout.ts";
import { MOUNT_POINTS, WORKSPACE } from "../vfs.ts";

/** The /config keys. */
export const PATHS_DENY_CONFIG_KEY = "paths.deny";
export const PATHS_ALLOW_CONFIG_KEY = "paths.allow";

/** What an entry must be, for messages. */
export const PATH_ENTRY_RULE =
  "entries separated by commas, each a path of a mount in any spelling or a path under /workspace, `*` for any run of characters";

/** The mount Orkeon Code keeps to itself: config.json and launch.json, the physical bases inside. */
export const USER_CONFIG_MOUNT = "/user-config";

/** The lists as the callbacks check them: canonical patterns, a bare entry present as itself and as `<entry>/*`. */
export interface PathLists {
  deny: readonly string[];
  allow: readonly string[];
}

export const EMPTY_PATH_LISTS: PathLists = Object.freeze({ deny: Object.freeze([]), allow: Object.freeze([]) }) as PathLists;

export interface PathListsParse extends PathLists {
  /** Each entry left out, as written, and why. */
  problems: string[];
}

/** The raw values of the two keys of one settings file, undefined when unset. */
export interface PathListValues {
  deny?: string;
  allow?: string;
}

const DRIVE_OR_UNC = /^(?:[A-Za-z]:|\\\\|\/\/|\\)/;

/** Whether a path is spelled as a Windows drive or UNC path. */
const windowsSpelled = (text: string): boolean => DRIVE_OR_UNC.test(text);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^$|()[\]{}\\]/g, "\\$&");

/** Whether a posix path lies under a Windows drive the WSL automount exposes (`/mnt/c/…`). */
function underAutomount(path: string, layout: HostLayout): boolean {
  const root = layout.automountRoot === "/" ? "" : layout.automountRoot;
  return new RegExp(`^${escapeRegExp(root)}/[A-Za-z](?:/|$)`).test(path);
}

/** Whether a canonical path starts with a mount point of the VFS: one the launchers give, or one of the layout. */
function onMount(path: string, layout: HostLayout): boolean {
  const first = `/${path.split("/")[1] ?? ""}`;
  return MOUNT_POINTS.includes(first) || layout.mounts.some((m) => m.virtual === first);
}

/** One entry to its canonical virtual spelling, or the reason it has none. */
function canonicalEntry(given: string, layout: HostLayout): { canonical?: string; problem?: string } {
  const relative = !given.startsWith("/") && !windowsSpelled(given);
  const virtual = normalisePath(toVirtual(relative ? `${WORKSPACE}/${given}` : given, layout));
  if (!virtual.startsWith("/")) return { problem: `'${given}' is under no mount of this host: no rule` };
  if (virtual === "/") return { problem: `'${given}' names every path: no rule` };
  if (layout.flavour === "wsl" && underAutomount(virtual, layout)) {
    return { problem: `'${given}' is under no mount of this host: no rule` };
  }
  return { canonical: virtual };
}

/** The entries of a value as written: trimmed, the blanks left out. */
const writtenEntries = (value: string): string[] => value.split(/[,\n]/).map((e) => e.trim()).filter((e) => e.length > 0);

/** Why a value of paths.deny or paths.allow is refused by /config set, on its notation alone (which mount an entry
 *  lies under is the run's to judge, with the host's layout): no entry, an entry holding a quote, one naming every path. */
export function pathListProblem(value: string): string | undefined {
  const entries = writtenEntries(value);
  if (entries.length === 0) return `no entry (${PATH_ENTRY_RULE})`;
  for (const entry of entries) {
    if (/["'`]/.test(entry)) return `'${entry}' holds a quote: write the path bare, its spaces included (${PATH_ENTRY_RULE})`;
    if (/^[\\/]?\*?[\\/]?$/.test(entry)) return `'${entry}' names every path (${PATH_ENTRY_RULE})`;
  }
  return undefined;
}

/** The patterns one canonical entry stands for: a bare path covers itself and what is below it. */
const patternsOf = (canonical: string): string[] => canonical.includes("*") ? [canonical] : [canonical, `${canonical}/*`];

/** The entries of one value, each canonical, in the order given; `problems` says what was left out and why. */
export function parsePathEntries(value: unknown, layout: HostLayout): { entries: string[]; problems: string[] } {
  const given = writtenEntries(String(value ?? ""));
  const entries: string[] = [];
  const problems: string[] = [];
  for (const entry of given) {
    const { canonical, problem } = canonicalEntry(entry, layout);
    if (problem !== undefined) problems.push(problem);
    else if (canonical !== undefined && !entries.includes(canonical)) entries.push(canonical);
  }
  return { entries, problems };
}

/** Whether `path` lies within what `pattern` covers, case folded as the host folds it. */
function within(pattern: string, path: string, layout: HostLayout): boolean {
  return globMatches(folded(pattern, layout), folded(path, layout));
}

/** A path as it is compared: lower-cased where the host's file system ignores the case (every path on native Windows,
 *  a path under a mount whose base is a Windows drive under WSL), as written elsewhere. */
function folded(path: string, layout: HostLayout): string {
  if (layout.flavour === "windows") return path.toLowerCase();
  if (layout.flavour !== "wsl") return path;
  const virtual = `/${path.split("/")[1] ?? ""}`;
  const mount = layout.mounts.find((m) => m.virtual === virtual);
  const onDrive = mount !== undefined
    && ((mount.posix !== undefined && underAutomount(mount.posix, layout)) || /^[A-Za-z]:/.test(mount.windows ?? ""));
  return onDrive ? path.toLowerCase() : path;
}

/**
 * The lists as they apply: the user's denies and the project's, added; the user's allows, and the project's allow
 * entries within them — a project file narrows, never widens: when the user allows nothing in particular, the
 * project's allows stand whole. Every entry canonical; the problems name each entry left out, with its key.
 */
export function readPathLists(user: PathListValues, project: PathListValues, layout: HostLayout): PathListsParse {
  const problems: string[] = [];
  const read = (value: unknown, key: string, who: string): string[] => {
    const parsed = parsePathEntries(value, layout);
    problems.push(...parsed.problems.map((p) => `${key} (${who}): ${p}`));
    return parsed.entries;
  };
  const userDeny = read(user.deny, PATHS_DENY_CONFIG_KEY, "user");
  const projectDeny = read(project.deny, PATHS_DENY_CONFIG_KEY, "project");
  const userAllow = read(user.allow, PATHS_ALLOW_CONFIG_KEY, "user");
  const projectAllow = read(project.allow, PATHS_ALLOW_CONFIG_KEY, "project").filter((entry) => {
    const kept = userAllow.length === 0 || userAllow.some((u) => patternsOf(u).some((p) => within(p, entry, layout)));
    if (!kept) problems.push(`${PATHS_ALLOW_CONFIG_KEY} (project): '${entry}' is outside the user's list; a project file may only narrow it`);
    return kept;
  });
  const unique = (entries: string[]): string[] => [...new Set(entries.flatMap(patternsOf))];
  return { deny: unique([...userDeny, ...projectDeny]), allow: unique([...userAllow, ...projectAllow]), problems };
}

/**
 * The project's paths.allow as it applies over the user's, judged without the host (the config schema's layering,
 * /config list and /doctor): an entry within the user's list is kept as written, one outside it is dropped; an entry
 * the identity host cannot read (a physical spelling) is kept, the run judges it with the layout. A user allowing
 * nothing in particular keeps them all, as readPathLists does.
 */
export function narrowAllowValue(project: string, user: string | undefined): { kept: string[]; dropped: string[] } {
  const userPatterns = user === undefined ? [] : parsePathEntries(user, IDENTITY_HOST).entries.flatMap(patternsOf);
  if (userPatterns.length === 0) return { kept: writtenEntries(project), dropped: [] };
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const entry of writtenEntries(project)) {
    const { canonical } = canonicalEntry(entry, IDENTITY_HOST);
    const inside = canonical === undefined || userPatterns.some((p) => within(p, canonical, IDENTITY_HOST));
    (inside ? kept : dropped).push(entry);
  }
  return { kept, dropped };
}

/** The entries of a list as a reader meets them: each canonical entry once, without the `<entry>/*` twin a bare entry
 *  stands for. */
export function listedEntries(patterns: readonly string[]): string[] {
  return patterns.filter((p) => !(p.endsWith("/*") && patterns.includes(p.slice(0, -2))));
}

/** The spellings the gate may meet a canonical pattern in: itself, and relative to the project when under it. */
function gateForms(pattern: string): string[] {
  return pattern.startsWith(`${WORKSPACE}/`) ? [pattern, pattern.slice(WORKSPACE.length + 1)] : [pattern];
}

/**
 * The deny rules of the lists for the gate, on the canonical spelling and the relative one: each pattern on the
 * `path` of every reading and writing tool; a shell rule on the absolute pattern as a run of the command's text; and
 * once a deny exists, the tools whose paths the gate cannot read denied whole (UNSCOPED_READ_TOOLS and
 * UNSCOPED_WRITE_TOOLS). An allow gives the gate nothing: it narrows, and pathListRefusal holds it. The other
 * spellings and the host's case are pathListRefusal's too.
 */
export function pathListRules(lists: PathLists): PermissionRule[] {
  if (lists.deny.length === 0) return [];
  const tools = [...PATH_READ_TOOLS, ...PATH_WRITE_TOOLS];
  const paths = lists.deny.flatMap((pattern) => denyEach(tools, "path", gateForms(pattern)));
  const commands = lists.deny.filter((p) => !p.endsWith("/*")).map((p): PermissionRule =>
    ({ effect: "deny", tool: "shell_command", argument: "command", pattern: `*${p}*` }));
  return [...paths, ...commands, ...denyWhole([...UNSCOPED_READ_TOOLS, ...UNSCOPED_WRITE_TOOLS])];
}

/** The built-in rules that close the whole /user-config mount to the model: its readers and writers by path, the
 *  folder readers on the mount itself, and any shell command naming it. In force beside the memory rules. */
export function userConfigRules(): PermissionRule[] {
  return [
    ...denyEach([...PATH_READ_TOOLS, ...PATH_WRITE_TOOLS], "path", [`${USER_CONFIG_MOUNT}/*`]),
    ...denyEach(FOLDER_READ_TOOLS, "path", [USER_CONFIG_MOUNT]),
    { effect: "deny", tool: "shell_command", argument: "command", pattern: `*${USER_CONFIG_MOUNT}*` },
  ];
}

const BUILT_IN_DENIES: readonly string[] = [USER_CONFIG_MOUNT, `${USER_CONFIG_MOUNT}/*`];

/** A path named by a call: as the call spells it, and canonical. A word of a shell command that names no mount
 *  (`/dev/null`, `/usr/bin/env`) is `unmounted`: a deny may still cover it, the allow list does not judge it. */
interface NamedPath { given: string; canonical: string; unmounted?: boolean }

/** A spelling to its canonical virtual path: a relative one under the project; a Windows spelling under no mount
 *  stays as written (the VFS refuses it anyway) and a deny never matches it. */
function canonicalOf(given: string, layout: HostLayout): string {
  const virtual = toVirtual(given, layout);
  if (windowsSpelled(virtual)) return virtual;
  return normalisePath(virtual.startsWith("/") ? virtual : `${WORKSPACE}/${virtual}`);
}

const plain = (value: unknown): string | undefined => typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/** The words of a shell command that name a path: absolute or Windows spelled, or holding a separator (a relative
 *  path); the value of a `key=value` word (`--out=…`, `FOO=…`), the target of a redirection (`2>/dev/null`); never
 *  an option, a URL or a bare word. The command is read with its physical spellings canonicalised first
 *  (textToVirtual), so an unquoted Windows path with spaces is one word, never its fragments. */
function commandPaths(command: string, layout: HostLayout): string[] {
  const words = new Set(shellCommandForms(textToVirtual(command, layout)).flatMap(shellWords));
  const paths: string[] = [];
  for (const word of words) {
    const equals = word.indexOf("=");
    const assigned = equals > 0 && !/[/\\]/.test(word.slice(0, equals)) ? word.slice(equals + 1) : word;
    const value = assigned.replace(/^[0-9]*[<>]{1,2}&?/, "");
    if (value === "" || value.startsWith("-") || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) continue;
    const pathLike = value.startsWith("/") || windowsSpelled(value) || /[/\\]/.test(value);
    if (pathLike && !paths.includes(value)) paths.push(value);
  }
  return paths;
}

/** Every path one call names, canonical beside its spelling. */
function namedPaths(tool: string, args: Readonly<Record<string, unknown>>, layout: HostLayout): NamedPath[] {
  const given: string[] = [];
  for (const field of ["path", "root_path", "working_directory"]) {
    const value = plain(args[field]);
    if (value !== undefined) given.push(value);
  }
  if (Array.isArray(args.paths)) given.push(...args.paths.map(plain).filter((p): p is string => p !== undefined));
  if (sameToolName(tool, OPERATIONS_TOOL) && Array.isArray(args.operations)) {
    for (const op of args.operations) {
      const path = op !== null && typeof op === "object" ? plain((op as { path?: unknown }).path) : undefined;
      if (path !== undefined) given.push(path);
    }
  }
  given.push(...reachedPaths(tool, args));
  const named: NamedPath[] = [...new Set(given)].map((g) => ({ given: g, canonical: canonicalOf(g, layout) }));
  if (sameToolName(tool, "shell_command") && typeof args.command === "string") {
    for (const word of commandPaths(args.command, layout)) {
      const canonical = canonicalOf(word, layout);
      if (!named.some((n) => n.given === word)) named.push({ given: word, canonical, unmounted: !onMount(canonical, layout) });
    }
  }
  return named;
}

const spelled = (p: NamedPath): string => p.given === p.canonical ? `'${p.given}'` : `'${p.given}' (${p.canonical})`;

/**
 * Why a call falls under the lists, or null: the first path it names (its `path`, `root_path`, `working_directory`,
 * `paths`, each operation of an edit_batch, what a folder reader reaches, the words of a shell command) that a deny
 * pattern covers, the built-in deny of /user-config included; else, when an allow list stands, the first path outside
 * every allow pattern, the words of a shell command that name no mount (`/dev/null`) apart. Each path read canonical
 * and in the host's case. Best effort on a shell command: what a script reaches by itself, and a folder reader over
 * a folder above a denied one, are outside this check.
 */
export function pathListRefusal(lists: PathLists, layout: HostLayout, tool: string, input: unknown): string | null {
  const args = input !== null && typeof input === "object" && !Array.isArray(input) ? input as Readonly<Record<string, unknown>> : {};
  const named = namedPaths(tool, args, layout);
  for (const path of named) {
    const builtIn = BUILT_IN_DENIES.find((p) => within(p, path.canonical, layout));
    if (builtIn !== undefined) return `${tool} on ${spelled(path)} is refused: ${USER_CONFIG_MOUNT} is Orkeon Code's own`;
    const deny = lists.deny.find((p) => within(p, path.canonical, layout));
    if (deny !== undefined) return `${tool} on ${spelled(path)} is refused by ${PATHS_DENY_CONFIG_KEY} '${deny}'`;
  }
  if (lists.allow.length === 0) return null;
  const outside = named.find((path) => path.unmounted !== true && !lists.allow.some((p) => within(p, path.canonical, layout)));
  return outside === undefined ? null : `${tool} on ${spelled(outside)} is outside ${PATHS_ALLOW_CONFIG_KEY}`;
}
