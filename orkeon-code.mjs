#!/usr/bin/env node
// The `orkeon-code` command of the npm package. npm's shims cannot run a bash script on Windows, so this starts
// the launcher beside it: `bash orkeon-code` on Linux and macOS, `orkeon-code.ps1` on Windows (pwsh when on
// PATH, else Windows PowerShell), stdio inherited, the arguments passed through, its exit code returned.
// Nothing else happens here: trust, settings, state and esbuild stay in the launchers, so the archive and the
// npm package behave the same (the launcher finds the esbuild npm installed beside it, in node_modules/@esbuild,
// after a packaged runtime's own). Plain ESM, for the Node of the published package's "engines".
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { constants } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The launcher's long options and the parameters of orkeon-code.ps1 they stand for. */
const PS_PARAMS = { "--settings": "-Settings", "--workspace": "-Workspace", "--mode": "-Mode" };

/** The arguments of ./orkeon-code as orkeon-code.ps1 binds them: `--settings x`, `--settings=x` and `--version`
 *  become `-Settings x` and `-Version`; `--` and what follows it pass as is (PowerShell's end of parameters, so a
 *  REPL argument such as `-x` is never taken for a parameter of the script). */
export function powershellArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { out.push(...argv.slice(i)); break; }
    if (a === "--version") { out.push("-Version"); continue; }
    const eq = a.indexOf("=");
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (Object.hasOwn(PS_PARAMS, name)) {
      out.push(PS_PARAMS[name]);
      if (eq > 0) out.push(a.slice(eq + 1));
      else if (i + 1 < argv.length) out.push(argv[++i]);
      continue;
    }
    out.push(a);
  }
  return out;
}

/** The command that starts the launcher of the package at `root`. */
export function launchCommand(platform, root, argv, hasPwsh) {
  if (platform === "win32") {
    return {
      command: hasPwsh ? "pwsh" : "powershell",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "orkeon-code.ps1"), ...powershellArgs(argv)],
    };
  }
  return { command: "bash", args: [join(root, "orkeon-code"), ...argv] };
}

function onPath(exe) {
  return (process.env.PATH ?? process.env.Path ?? "").split(delimiter).some((dir) => dir && existsSync(join(dir, exe)));
}

function main() {
  const root = dirname(realpathSync(fileURLToPath(import.meta.url)));
  const windows = process.platform === "win32";
  const { command, args } = launchCommand(process.platform, root, process.argv.slice(2), windows && onPath("pwsh.exe"));
  const child = spawn(command, args, { stdio: "inherit" });
  // Ctrl-C reaches the REPL through the terminal's process group: the REPL owns it, this shim waits. A
  // termination sent to the shim alone is passed on (POSIX only: Windows has no signal to forward).
  process.on("SIGINT", () => {});
  if (!windows) for (const signal of ["SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
  child.on("error", (e) => {
    console.error(`orkeon-code: cannot start ${command}: ${e.message}`);
    process.exit(127);
  });
  child.on("exit", (code, signal) => process.exit(signal ? 128 + (constants.signals[signal] ?? 0) : code ?? 1));
}

// Run when started as the command (npm links it, or a .cmd shim names it), not when a test imports it.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
