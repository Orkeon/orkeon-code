// The host Orkeon Code was started on, as the launcher wrote it to /user-config/launch.json (docs/architecture.md,
// "The VFS and the host platform"): its flavour (a posix system, WSL, native Windows) and the physical base of each
// VFS mount, in the spellings the launcher knows. The code never learns these bases from the runtime, which hides
// them (list_mounts answers virtual paths only): the launcher is the one holder. Without the file, or with one it
// cannot read, the layout is IDENTITY_HOST and every conversion of host-paths.ts is the identity. Pure.

export type HostFlavour = "posix" | "wsl" | "windows";

/** One mount and its physical base as the launcher passed it to `--mount`, in each spelling it knows. */
export interface MountBase {
  /** The virtual path, `/workspace`. */
  virtual: string;
  /** The base as the posix side spells it (`/mnt/c/ici est/mon repertoire`, `/home/me/x`): absent on native Windows. */
  posix?: string;
  /** The base as Windows spells it (`C:\ici est\mon repertoire`, `\\wsl.localhost\Ubuntu\home\me\x`): absent on a
   *  plain posix host, and under WSL when the launcher had no `wslpath`. */
  windows?: string;
}

export interface HostLayout {
  flavour: HostFlavour;
  /** The WSL distribution (`Ubuntu`), for the `\\wsl$\<distro>\` and `\\wsl.localhost\<distro>\` spellings. */
  distro?: string;
  /** Where WSL mounts the Windows drives: `/mnt` (then `C:` is `/mnt/c`). */
  automountRoot: string;
  mounts: MountBase[];
}

/** No host facts: a posix host whose bases are unknown, every conversion the identity. */
export const IDENTITY_HOST: HostLayout = Object.freeze({ flavour: "posix", automountRoot: "/mnt", mounts: [] }) as HostLayout;

/** The version of launch.json this code reads. */
export const HOST_LAYOUT_VERSION = 1;

const FLAVOURS: readonly HostFlavour[] = ["posix", "wsl", "windows"];

/**
 * The layout a launch.json holds. Anything unusable (not an object, another version, an unknown flavour) is
 * IDENTITY_HOST with the reason in `problems`; a mount entry that is not usable is dropped and named there, the
 * others kept. Each base is normalised: no trailing separator (a drive root keeps `C:\`), the drive letter
 * upper-cased in a Windows spelling and lower-cased under the automount root, `/` for `\` in a Windows spelling.
 */
export function parseHostLayout(raw: unknown): { layout: HostLayout; problems: string[] } {
  const problems: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { layout: IDENTITY_HOST, problems: ["launch.json is not an object"] };
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== HOST_LAYOUT_VERSION) {
    return { layout: IDENTITY_HOST, problems: [`launch.json version ${String(o.version)} is not ${HOST_LAYOUT_VERSION}`] };
  }
  if (typeof o.flavour !== "string" || !FLAVOURS.includes(o.flavour as HostFlavour)) {
    return { layout: IDENTITY_HOST, problems: [`launch.json flavour '${String(o.flavour)}' is not posix, wsl or windows`] };
  }
  const flavour = o.flavour as HostFlavour;
  const wsl = flavour === "wsl" && o.wsl !== null && typeof o.wsl === "object" ? (o.wsl as Record<string, unknown>) : {};
  const distro = typeof wsl.distro === "string" && wsl.distro !== "" ? wsl.distro : undefined;
  const automountRoot = typeof wsl.automountRoot === "string" && wsl.automountRoot.startsWith("/")
    ? trimTrailing(wsl.automountRoot, "/") || "/"
    : "/mnt";
  const mounts: MountBase[] = [];
  const plain = o.mounts !== null && typeof o.mounts === "object" && !Array.isArray(o.mounts);
  if (o.mounts !== undefined && !plain) problems.push("launch.json mounts is not an object");
  const entries = plain ? Object.entries(o.mounts as Record<string, unknown>) : [];
  for (const [virtual, bases] of entries) {
    const mount = parseMount(virtual, bases, automountRoot, problems);
    if (mount !== null) mounts.push(mount);
  }
  return { layout: { flavour, ...(distro === undefined ? {} : { distro }), automountRoot, mounts }, problems };
}

function parseMount(virtual: string, bases: unknown, automountRoot: string, problems: string[]): MountBase | null {
  if (!/^\/[^/\\]+$/.test(virtual)) {
    problems.push(`launch.json mount '${virtual}' is not a mount point`);
    return null;
  }
  if (bases === null || typeof bases !== "object" || Array.isArray(bases)) {
    problems.push(`launch.json mount '${virtual}' has no bases`);
    return null;
  }
  const b = bases as Record<string, unknown>;
  const posix = typeof b.posix === "string" ? normalisePosixBase(b.posix, automountRoot) : undefined;
  const windows = typeof b.windows === "string" ? normaliseWindowsBase(b.windows) : undefined;
  if (typeof b.posix === "string" && posix === undefined) problems.push(`launch.json mount '${virtual}': posix base '${b.posix}' is not an absolute path`);
  if (typeof b.windows === "string" && windows === undefined) problems.push(`launch.json mount '${virtual}': windows base '${b.windows}' is not a drive or UNC path`);
  if (posix === undefined && windows === undefined) {
    if (typeof b.posix !== "string" && typeof b.windows !== "string") problems.push(`launch.json mount '${virtual}' has no usable base`);
    return null;
  }
  return { virtual, ...(posix === undefined ? {} : { posix }), ...(windows === undefined ? {} : { windows }) };
}

/** An absolute posix base without its trailing `/`; the drive letter lower-cased under the automount root. */
function normalisePosixBase(base: string, automountRoot: string): string | undefined {
  if (!base.startsWith("/")) return undefined;
  const trimmed = trimTrailing(base, "/");
  if (trimmed === "") return undefined;
  const root = automountRoot === "/" ? "" : automountRoot;
  const drive = new RegExp(`^${escapeRegExp(root)}/([A-Za-z])(/|$)`).exec(trimmed);
  return drive === null ? trimmed : `${root}/${drive[1].toLowerCase()}${trimmed.slice(root.length + 2)}`;
}

/** A Windows base with `\`, no trailing separator (a drive root keeps `C:\`), its drive letter upper-cased. */
function normaliseWindowsBase(base: string): string | undefined {
  const backslashed = base.replace(/\//g, "\\");
  const drive = /^([A-Za-z]):(\\|$)/.exec(backslashed);
  if (drive !== null) {
    const rest = trimTrailing(backslashed.slice(2), "\\");
    return `${drive[1].toUpperCase()}:${rest === "" ? "\\" : rest}`;
  }
  if (/^\\\\[^\\]+\\[^\\]+/.test(backslashed)) return trimTrailing(backslashed, "\\");
  return undefined;
}

function trimTrailing(text: string, char: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === char) end--;
  return text.slice(0, end);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** True when `layout` carries no host fact: a posix flavour and no mount. */
export function isIdentityHost(layout: HostLayout): boolean {
  return layout.flavour === "posix" && layout.mounts.length === 0;
}

/** The layout in a line, for /doctor: the flavour, under WSL the distribution and the automount root, then each mount
 *  with its base as the host spells it, the Windows spelling in parentheses under WSL when the launcher knew it. */
export function describeHostLayout(layout: HostLayout): string {
  const where = layout.flavour === "wsl"
    ? `wsl (${layout.distro ?? "distribution unknown"}, drives under ${layout.automountRoot})`
    : layout.flavour;
  if (layout.mounts.length === 0) return `${where}, no mount base: every path as the runtime spells it`;
  const bases = layout.mounts.map((m) => {
    const base = layout.flavour === "windows" ? (m.windows ?? m.posix) : (m.posix ?? m.windows);
    const other = layout.flavour === "wsl" && m.posix !== undefined && m.windows !== undefined ? ` (${m.windows})` : "";
    return `${m.virtual} = ${base ?? "?"}${other}`;
  });
  return `${where}: ${bases.join(", ")}`;
}
