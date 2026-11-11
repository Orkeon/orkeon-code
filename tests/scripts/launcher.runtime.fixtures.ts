// The data of launcher.runtime.test.ts: a tiny runtime archive, the .orkeon-runtime that names it, a curl that
// serves it from the disk, and a PATH on which no runtime of the machine is found.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESBUILD, recorder, scratchDir } from "./launcher.fixtures.ts";
import type { LaunchOptions, Run } from "./launcher.fixtures.ts";

export const RUNTIME_ID = "abc1234";
export const RUNTIME_URL = "https://runtime.invalid/builds";
export const ARCHIVE_NAME = `orkeon-runtime-${RUNTIME_ID}-linux-x64.tar.gz`;
/** What the curl stand-in records: the URL it was asked for. */
export const CURL_CALL = `curl ${RUNTIME_URL}/${ARCHIVE_NAME}`;
/** What the REPL of the downloaded runtime records, beside its arguments: it ran, not another one. */
export const OWN_REPL_RAN = "own-runtime";

const OWN_REPL = recorder(`echo ${OWN_REPL_RAN} >> "$RECORD/calls"\n`);

/** A runtime archive as the release builds it: one folder holding bin/orkeon-repl. */
function buildArchive(): { archive: string; sum: string } {
  const dir = scratchDir("orkeon-code-runtime-archive-");
  const top = `orkeon-runtime-${RUNTIME_ID}-linux-x64`;
  mkdirSync(join(dir, top, "bin"), { recursive: true });
  writeFileSync(join(dir, top, "bin", "orkeon-repl"), OWN_REPL);
  chmodSync(join(dir, top, "bin", "orkeon-repl"), 0o755);
  const archive = join(dir, ARCHIVE_NAME);
  const tar = spawnSync("tar", ["-czf", archive, "-C", dir, top], { encoding: "utf-8" });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
  return { archive, sum: createHash("sha256").update(readFileSync(archive)).digest("hex") };
}

let built: { archive: string; sum: string } | undefined;
const archiveOnce = () => (built ??= buildArchive());

/** The text of .orkeon-runtime naming the archive, with `sum` for linux-x64 (the archive's own by default). */
export const manifest = (opts: { id?: string; sum?: string } = {}) =>
  `# test\nid=${opts.id ?? RUNTIME_ID}\nurl=${RUNTIME_URL}\nlinux-x64=${opts.sum ?? archiveOnce().sum}\n`;

export const WRONG_SUM = "0".repeat(64);

/** curl, serving the archive whatever the URL, which it records. */
const CURL = '#!/bin/sh\nfor a in "$@"; do url="$a"; done\necho "curl $url" >> "$RECORD/calls"\n'
  + 'while [ $# -gt 1 ]; do if [ "$1" = -o ]; then out="$2"; fi; shift; done\ncp "$RUNTIME_ARCHIVE" "$out"\n';

/** uname, saying the platform the archive is built for, whatever machine runs the tests. */
const unameOf = (system: string, machine: string) => `#!/bin/sh\ncase "$1" in -s) echo ${system} ;; -m) echo ${machine} ;; *) echo ${system} ;; esac\n`;

let bare: string | undefined;

/** The machine's /usr/bin and /bin without Docker nor orkeon-repl, as one folder of links. */
export function pathWithoutRuntime(): string {
  if (bare) return bare;
  bare = scratchDir("orkeon-code-no-runtime-path-");
  for (const dir of ["/bin", "/usr/bin"]) {
    for (const name of readdirSync(dir)) {
      if (name === "docker" || name === "orkeon-repl") continue;
      try { symlinkSync(join(dir, name), join(bare, name)); } catch { /* the name is already linked from the other folder */ }
    }
  }
  return bare;
}

/** A home (ORKEON_CODE_HOME) that already holds the downloaded runtime `id`. */
export function homeWithRuntime(id = RUNTIME_ID): string {
  const home = scratchDir("orkeon-code-home-");
  mkdirSync(join(home, "runtime", id, "bin"), { recursive: true });
  writeFileSync(join(home, "runtime", id, "bin", "orkeon-repl"), OWN_REPL);
  chmodSync(join(home, "runtime", id, "bin", "orkeon-repl"), 0o755);
  return home;
}

export interface RuntimeStart {
  args?: string[]; bin?: Record<string, string>; env?: Record<string, string>; tty?: string; bare?: boolean;
  /** The .orkeon-runtime of the package; the one naming the test archive by default. */
  manifest?: string;
  /** The platform uname names (Linux x86_64 by default). */
  platform?: readonly [system: string, machine: string];
}

/** An install started on a machine with no runtime of its own, a curl that serves the test archive on PATH. */
export function installStart(o: RuntimeStart = {}): LaunchOptions {
  const [system, machine] = o.platform ?? ["Linux", "x86_64"];
  return {
    args: o.args ?? [], install: true, tty: o.tty, bare: o.bare, systemPath: pathWithoutRuntime(),
    bin: { curl: CURL, uname: unameOf(system, machine), ...o.bin },
    env: { ...ESBUILD, RUNTIME_ARCHIVE: archiveOnce().archive, ...o.env },
    files: { "checkout/.orkeon-runtime": o.manifest ?? manifest() },
  };
}

export const AGREED = { ORKEON_CODE_RUNTIME_DOWNLOAD: "1" };
export const DOCKER = { docker: recorder() };
export const TOOL = { "orkeon-repl": recorder() };

/** Where a start keeps its downloaded runtimes: `home` when ORKEON_CODE_HOME named one, else ~/.orkeon-code. */
export const runtimeHome = (r: Run, home?: string) => join(home ?? join(r.root, "..", ".orkeon-code"), "runtime");

export const QUESTION = ["no Orkeon runtime found on this machine", `Orkeon ${RUNTIME_ID} can be downloaded once`, "[y] download  [n] quit"];
export const NO_TERMINAL = ["no terminal to ask in", "orkeon-code runtime install", "ORKEON_CODE_RUNTIME_DOWNLOAD=1"];
