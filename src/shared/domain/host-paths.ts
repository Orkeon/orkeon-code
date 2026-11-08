// One path, many spellings. The runtime maps a virtual path (`/workspace/src/a.ts`) to the disk, but the disk's own
// spellings come back to the code and to the model in what a program prints, in what the user types and in what the
// model writes: `C:\ici est\mon repertoire\src\a.ts` on Windows, `/mnt/c/ici est/mon repertoire/src/a.ts` under WSL,
// `\\wsl.localhost\Ubuntu\home\me\x` for a Linux folder seen from Windows, `C:/…` from git for Windows. These functions
// bring every such spelling back to the one canonical spelling, the virtual path with `/` and no trailing separator,
// from the bases a HostLayout holds (docs/architecture.md, "The VFS and the host platform"). They never produce a
// physical spelling for the runtime: a command leaves the code with virtual paths, which the runtime checks against the
// VFS rights before it spells them for the process (ADR 0022). On IDENTITY_HOST every function is the identity. Pure.
import { sameToolName } from "./agent-policy/permission.ts";
import { type HostLayout, type MountBase, isIdentityHost } from "./host-layout.ts";

/** One spelling read into its parts: the segments after a drive, a UNC share or the posix root. */
type Parsed =
  | { kind: "drive"; drive: string; segments: string[] }
  | { kind: "unc"; server: string; share: string; segments: string[] }
  | { kind: "posix"; segments: string[] };

/** A base of a mount, parsed, with the spelling it came from. */
interface Base { virtual: string; raw: string; spelling: "posix" | "windows"; parsed: Parsed }

/** A character that continues a path segment (as path-rebase.ts reads it). */
const SEGMENT = /[\w.-]/;

/** What ends an unquoted path in free text: whitespace, a quote, brackets, a comma, a colon, a semicolon, a pipe. */
const DELIMITER = /[\s"'`()<>\[\]{},:;|]/;

const WSL_SERVERS: readonly string[] = ["wsl$", "wsl.localhost"];

// ---- reading one spelling ----

/**
 * One whole path in any spelling, or null when it is not an absolute path (relative, `.` or `..` inside, an empty
 * segment, `C:foo`). `/mnt/<d>/…` is a drive under WSL; `\\wsl$\<distro>\…` and `\\wsl.localhost\<distro>\…` are the
 * posix form when `<distro>` is the layout's; on the posix flavour a `\` is a character of a name, elsewhere a separator.
 */
function parsePhysical(text: string, layout: HostLayout): Parsed | null {
  let rest: string;
  let kind: Parsed;
  const extended = /^\\\\\?\\(.*)$/s.exec(text);
  const body = extended === null ? text : extended[1];
  const uncLong = extended !== null ? /^UNC\\(.*)$/is.exec(body) : null;
  const unc = uncLong !== null ? /^([^\\/]+)[\\/]([^\\/]+)(.*)$/s.exec(uncLong[1]) : /^(?:\\\\|\/\/)([^\\/]+)[\\/]([^\\/]+)(.*)$/s.exec(body);
  const drive = unc === null ? /^([A-Za-z]):(?:([\\/].*)|)$/s.exec(body) : null;
  if (unc !== null) {
    const [, server, share, tail] = unc;
    rest = tail;
    const alias = WSL_SERVERS.includes(server.toLowerCase()) && layout.distro !== undefined && share.toLowerCase() === layout.distro.toLowerCase();
    kind = alias ? { kind: "posix", segments: [] } : { kind: "unc", server: server.toLowerCase(), share: share.toLowerCase(), segments: [] };
  } else if (drive !== null) {
    kind = { kind: "drive", drive: drive[1].toUpperCase(), segments: [] };
    rest = drive[2] ?? "";
  } else if (body.startsWith("/")) {
    if (extended !== null) return null;
    const automount = automountDrive(body, layout);
    if (automount !== null) return automount;
    kind = { kind: "posix", segments: [] };
    rest = body;
  } else {
    return null;
  }
  const separators = kind.kind === "posix" && layout.flavour === "posix" && unc === null ? /\/+/ : /[\\/]+/;
  const segments = rest.split(separators);
  if (segments[0] === "") segments.shift();
  if (segments.length > 0 && segments[segments.length - 1] === "") segments.pop();
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  kind.segments = segments;
  return kind;
}

/** `/mnt/c/…` under WSL as the drive `C:`; null when the path is not under the automount root with a drive letter. */
function automountDrive(path: string, layout: HostLayout): Parsed | null {
  if (layout.flavour !== "wsl") return null;
  const root = layout.automountRoot === "/" ? "" : layout.automountRoot;
  if (!path.startsWith(`${root}/`)) return null;
  const match = /^([A-Za-z])(?:\/(.*)|)$/s.exec(path.slice(root.length + 1));
  if (match === null) return null;
  const segments = (match[2] ?? "").split(/[\\/]+/).filter((s, i, all) => !(s === "" && i === all.length - 1));
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return { kind: "drive", drive: match[1].toUpperCase(), segments };
}

// ---- the bases of a layout ----

function basesOf(layout: HostLayout): Base[] {
  const bases: Base[] = [];
  for (const mount of layout.mounts) {
    for (const spelling of ["posix", "windows"] as const) {
      const raw = mount[spelling];
      if (raw === undefined) continue;
      const parsed = parsePhysical(raw, layout);
      if (parsed !== null) bases.push({ virtual: mount.virtual, raw, spelling, parsed });
    }
  }
  // The longest base first: a mount whose base lies under another's wins the paths under it.
  return bases.sort((a, b) => b.parsed.segments.length - a.parsed.segments.length);
}

/** Case counts for a posix name, never for a drive or a share (Windows names): the segments of `path` under `base`. */
function under(path: Parsed, base: Parsed): string[] | null {
  if (path.kind !== base.kind) return null;
  if (path.kind === "drive" && base.kind === "drive" && path.drive !== base.drive) return null;
  if (path.kind === "unc" && base.kind === "unc" && (path.server !== base.server || path.share !== base.share)) return null;
  if (path.segments.length < base.segments.length) return null;
  const fold = path.kind !== "posix";
  for (let i = 0; i < base.segments.length; i++) {
    const same = fold ? path.segments[i].toLowerCase() === base.segments[i].toLowerCase() : path.segments[i] === base.segments[i];
    if (!same) return null;
  }
  return path.segments.slice(base.segments.length);
}

const virtualOf = (mount: string, rest: readonly string[]): string => rest.length === 0 ? mount : `${mount}/${rest.join("/")}`;

// ---- one path ----

/**
 * One whole path in any spelling of a mount's base, as its canonical virtual path (`/workspace/un dossier/f.txt`: `/`,
 * no trailing separator). A virtual path spelled with `\` after its mount is normalised on a WSL or Windows host.
 * Anything else (a relative path, a path under no mount, a path with `.` or `..`) is returned as given.
 */
export function toVirtual(path: string, layout: HostLayout): string {
  if (isIdentityHost(layout)) return path;
  const parsed = parsePhysical(path, layout);
  if (parsed === null) return path;
  for (const base of basesOf(layout)) {
    const rest = under(parsed, base.parsed);
    if (rest !== null) return virtualOf(base.virtual, rest);
  }
  if (parsed.kind === "posix" && layout.flavour !== "posix" && parsed.segments.length > 0) {
    const mount = `/${parsed.segments[0]}`;
    if (layout.mounts.some((m) => m.virtual === mount)) return virtualOf(mount, parsed.segments.slice(1));
  }
  return path;
}

/**
 * A canonical virtual path in the physical spelling asked for, from the mount's base in that spelling; null when the
 * path is under no mount, or the mount has no base in that spelling. For the round trip and the diagnostics: never
 * for a command (ADR 0022).
 */
export function fromVirtual(path: string, layout: HostLayout, spelling: "posix" | "windows"): string | null {
  const segments = path.split("/");
  if (segments[0] !== "" || segments.length < 2) return null;
  const mount = layout.mounts.find((m) => m.virtual === `/${segments[1]}`);
  const raw = mount?.[spelling];
  if (raw === undefined) return null;
  const sep = spelling === "windows" ? "\\" : "/";
  const rest = segments.slice(2).join(sep);
  if (rest === "") return raw;
  return raw.endsWith(sep) ? raw + rest : raw + sep + rest;
}

// ---- free text ----

/** The literal spellings of a base a text may hold, each with whether case counts. */
interface Literal { text: string; fold: boolean; backslashed: boolean; virtual: string }

function literalsOf(layout: HostLayout): Literal[] {
  const literals: Literal[] = [];
  const add = (text: string, fold: boolean, backslashed: boolean, virtual: string) => {
    if (!literals.some((l) => l.text === text && l.fold === fold)) literals.push({ text, fold, backslashed, virtual });
  };
  for (const mount of layout.mounts) {
    // On a WSL or Windows host the runtime's own rewrite may leave `/workspace/un dossier\f.txt`: the mount is a literal too.
    if (layout.flavour !== "posix") add(mount.virtual, false, true, mount.virtual);
    if (mount.windows !== undefined) {
      add(mount.windows, true, true, mount.virtual);
      add(mount.windows.replace(/\\/g, "/"), true, false, mount.virtual);
      if (/^[A-Za-z]:/.test(mount.windows)) add(`\\\\?\\${mount.windows}`, true, true, mount.virtual);
    }
    if (mount.posix !== undefined) {
      add(mount.posix, layout.flavour !== "posix" && automountDrive(mount.posix, layout) !== null, false, mount.virtual);
      if (layout.distro !== undefined) {
        const tail = mount.posix.replace(/\//g, "\\");
        for (const server of WSL_SERVERS) add(`\\\\${server}\\${layout.distro}${tail}`, true, true, mount.virtual);
      }
    }
  }
  return literals.sort((a, b) => b.text.length - a.text.length);
}

/** True when a literal found at `at` starts a path there: nothing of a name right before it. */
const startsPath = (text: string, at: number): boolean => at === 0 || !/[\w./\\-]/.test(text[at - 1]);

/** True when a base ending at `at` ends there as a name: the end, a separator or a delimiter follows. */
const endsBase = (text: string, at: number): boolean => at >= text.length || text[at] === "/" || text[at] === "\\" || !SEGMENT.test(text[at]);

/** Where a word starting at `from` ends: the first delimiter, or a dot that ends a sentence. */
function wordEnd(line: string, from: number): number {
  let at = from;
  while (at < line.length && !DELIMITER.test(line[at]) && !(line[at] === "." && sentenceDot(line, at))) at++;
  return at;
}

/**
 * Where an unquoted path starting at `from` ends. A Windows path with a space in a name goes on over the spaces: the
 * path runs to the next word that holds a `\`, unless a word before it starts another path (`C:`, `\\`, `/`).
 */
function unquotedEnd(line: string, from: number, backslashed: boolean): number {
  let at = wordEnd(line, from);
  if (!backslashed) return at;
  for (;;) {
    let probe = at;
    let found = -1;
    while (line[probe] === " ") {
      const end = wordEnd(line, probe + 1);
      const word = line.slice(probe + 1, end);
      if (word === "" || word.startsWith("\\") || word.startsWith("/") || (word.length === 1 && line[end] === ":")) break;
      probe = end;
      if (word.includes("\\")) { found = end; break; }
    }
    if (found < 0) return at;
    at = found;
  }
}

const sentenceDot = (line: string, at: number): boolean => at + 1 >= line.length || /[\s"'`)\]]/.test(line[at + 1]);

/**
 * Every physical spelling of a mount's base in a text (a command's output, a tool's result, a prompt) replaced by the
 * canonical virtual path. A base is found literally (a space inside it counts); after an opening quote the path runs to
 * the closing quote on the line, else to the first delimiter (whitespace, quotes, brackets, `,` `:` `;` `|`, or a dot
 * that ends a sentence), a Windows path going on over a space when the next word still holds a `\`. With `keepFenced`,
 * the lines inside a ``` or ~~~ block are left as they are (a prompt that quotes code).
 */
export function textToVirtual(text: string, layout: HostLayout, options: { keepFenced?: boolean } = {}): string {
  if (isIdentityHost(layout) || text === "") return text;
  const literals = literalsOf(layout);
  if (literals.length === 0) return text;
  let fence: string | null = null;
  return text.split("\n").map((line) => {
    if (options.keepFenced) {
      const mark = /^\s*(```|~~~)/.exec(line)?.[1];
      if (mark !== undefined) {
        if (fence === null) fence = mark;
        else if (fence === mark) fence = null;
        return line;
      }
      if (fence !== null) return line;
    }
    return lineToVirtual(line, literals, layout);
  }).join("\n");
}

function lineToVirtual(line: string, literals: readonly Literal[], layout: HostLayout): string {
  const lower = line.toLowerCase();
  let out = "";
  let from = 0;
  for (let at = 0; at < line.length;) {
    const hit = literalAt(line, lower, at, literals);
    if (hit === null) { at++; continue; }
    const quote = at > 0 && (line[at - 1] === '"' || line[at - 1] === "'") ? line[at - 1] : null;
    const closing = quote === null ? -1 : line.indexOf(quote, at + hit.text.length);
    const end = closing >= 0 ? closing : unquotedEnd(line, at + hit.text.length, hit.backslashed);
    const candidate = line.slice(at, end);
    const virtual = toVirtual(candidate, layout);
    if (virtual === candidate) { at++; continue; }
    out += line.slice(from, at) + virtual;
    from = end;
    at = end;
  }
  return out + line.slice(from);
}

/** The longest literal starting a path at `at`, or null. */
function literalAt(line: string, lower: string, at: number, literals: readonly Literal[]): Literal | null {
  if (!startsPath(line, at)) return null;
  for (const literal of literals) {
    const found = literal.fold ? lower.startsWith(literal.text.toLowerCase(), at) : line.startsWith(literal.text, at);
    if (found && endsBase(line, at + literal.text.length)) return literal;
  }
  return null;
}

// ---- a shell command ----

/** One word of a shell command with its span in the text (quotes included) and the quote it opened with, if any. */
export interface CommandToken { start: number; end: number; value: string; quote: '"' | "'" | null }

/** The words of a command as shellWords splits them (agent-policy/permission.ts), each with where it stands. */
export function commandTokens(command: string): CommandToken[] {
  const tokens: CommandToken[] = [];
  let current = "";
  let start = -1;
  let quote: '"' | "'" | null = null;
  let single = false;
  let double = false;
  const flush = (end: number) => {
    if (start >= 0) tokens.push({ start, end, value: current, quote });
    current = "";
    start = -1;
    quote = null;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "'" && !double) {
      if (start < 0) start = i;
      if (quote === null) quote = "'";
      single = !single;
      continue;
    }
    if (c === '"' && !single) {
      if (start < 0) start = i;
      if (quote === null) quote = '"';
      double = !double;
      continue;
    }
    if (/\s/.test(c) && !single && !double) {
      flush(i);
      continue;
    }
    if (start < 0) start = i;
    current += c;
  }
  flush(command.length);
  return tokens;
}

/**
 * A command with each word that is a path in a physical spelling, whole or after its first `=`, in the canonical
 * virtual spelling; the quotes of a word are kept around the new value. What is not a whole word (a path inside a
 * script) stays as written.
 */
export function commandToVirtual(command: string, layout: HostLayout): string {
  if (isIdentityHost(layout) || command === "") return command;
  let out = "";
  let from = 0;
  for (const token of commandTokens(command)) {
    const value = valueToVirtual(token.value, layout);
    if (value === token.value) continue;
    const spelled = token.quote === null ? (/[\s'"]/.test(value) ? `"${value}"` : value) : `${token.quote}${value}${token.quote}`;
    out += command.slice(from, token.start) + spelled;
    from = token.end;
  }
  return out + command.slice(from);
}

/** A word as a path, or a `key=path`, in the canonical spelling; the word itself otherwise. */
function valueToVirtual(value: string, layout: HostLayout): string {
  const whole = toVirtual(value, layout);
  if (whole !== value) return whole;
  const eq = value.indexOf("=");
  if (eq <= 0 || eq === value.length - 1) return value;
  const right = toVirtual(value.slice(eq + 1), layout);
  return right === value.slice(eq + 1) ? value : value.slice(0, eq + 1) + right;
}

// ---- a tool call ----

/** The fields of a call that name a path or a folder, whatever the tool. */
const PATH_FIELDS: readonly string[] = ["path", "root_path", "working_directory"];
/** The fields that list paths. */
const PATHS_FIELDS: readonly string[] = ["paths"];
/** The field that holds the operations of an edit batch, each with its `path`. */
const OPERATIONS_FIELD = "operations";
const SHELL_TOOL = "shell_command";
const COMMAND_FIELD = "command";

/**
 * The input of a tool call with its path fields in the canonical spelling: `path`, `root_path`, `working_directory`,
 * the strings of `paths`, the `path` of each operation, and for the shell tool the words of `command`. Nothing else
 * is touched (a file's content, an edit's strings, a pattern). Null when nothing changed; the same again on its own
 * result (idempotent).
 */
export function callToVirtual(tool: string, input: unknown, layout: HostLayout): Record<string, unknown> | null {
  if (isIdentityHost(layout) || input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const given = input as Record<string, unknown>;
  const out: Record<string, unknown> = { ...given };
  let changed = false;
  const set = (key: string, value: unknown) => {
    if (value !== given[key]) { out[key] = value; changed = true; }
  };
  for (const key of PATH_FIELDS) {
    if (typeof given[key] === "string") set(key, toVirtual(given[key] as string, layout));
  }
  for (const key of PATHS_FIELDS) {
    const list = given[key];
    if (Array.isArray(list)) {
      const mapped = list.map((p) => (typeof p === "string" ? toVirtual(p, layout) : p));
      if (mapped.some((p, i) => p !== list[i])) set(key, mapped);
    }
  }
  const operations = given[OPERATIONS_FIELD];
  if (Array.isArray(operations)) {
    let any = false;
    const mapped = operations.map((op) => {
      if (op === null || typeof op !== "object" || typeof (op as Record<string, unknown>).path !== "string") return op;
      const path = toVirtual((op as Record<string, unknown>).path as string, layout);
      if (path === (op as Record<string, unknown>).path) return op;
      any = true;
      return { ...(op as Record<string, unknown>), path };
    });
    if (any) set(OPERATIONS_FIELD, mapped);
  }
  if (sameToolName(tool, SHELL_TOOL) && typeof given[COMMAND_FIELD] === "string") {
    set(COMMAND_FIELD, commandToVirtual(given[COMMAND_FIELD] as string, layout));
  }
  return changed ? out : null;
}
