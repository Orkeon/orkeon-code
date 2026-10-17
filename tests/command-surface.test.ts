// Command-surface regression (E-1 acceptance): every commands/*.cmd.ts
// declares exactly one primary name, names are unique (the loader's
// ValidateGlobalUniqueness would otherwise skip them as conflicts), match the
// loader's kebab-case rule, and the surface holds the post-E-1 count.
// Run: node --test tests/command-surface.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, match } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const COMMANDS_DIR = fileURLToPath(new URL("../src/commands", import.meta.url));
// 49: twelve commands folded into others or retired, /verify added — /reset-session
// is an alias of /clear; /version, /env, /session and /upgrade of /status; /ctx-viz
// of /context; /extra-usage of /usage; /bughunter became `/review --lens
// correctness`, /force-snip `/compact --snip`; /tag (a /memory add), /sandbox-toggle
// (it enforced nothing) and /onboarding (the native /help) are gone. Bumping this
// deliberately: the count is the guard against a command silently failing to load,
// so it must move only with a commit that adds or removes one.
const EXPECTED_COMMAND_COUNT = 49;

interface Cmd { file: string; name: string; aliases: string[] }

function collect(): Cmd[] {
  const out: Cmd[] = [];
  for (const f of readdirSync(COMMANDS_DIR).filter((f: string) => f.endsWith(".cmd.ts")).sort()) {
    const src = readFileSync(join(COMMANDS_DIR, f), "utf-8");
    // Every descriptor in the codebase declares `name: "<literal>"` — factory
    // helpers (toggleCommand) pass it through a `name:` field too.
    const names = [...src.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
    strictEqual(names.length, 1, `${f}: expected exactly one name literal, found ${names.length}`);
    const aliases = [...(src.match(/aliases:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    out.push({ file: f, name: names[0], aliases });
  }
  return out;
}

describe("command surface", () => {
  const cmds = collect();

  it(`holds ${EXPECTED_COMMAND_COUNT} *.cmd.ts commands (post-E-1)`, () => {
    strictEqual(cmds.length, EXPECTED_COMMAND_COUNT);
  });

  it("has zero name conflicts, aliases included (loader ValidateGlobalUniqueness)", () => {
    const seen = new Map<string, string>();
    for (const c of cmds) {
      for (const n of [c.name, ...c.aliases]) {
        ok(!seen.has(n), `duplicate command name '${n}' in ${c.file} and ${seen.get(n)}`);
        seen.set(n, c.file);
      }
    }
  });

  it("keeps the folded commands' names as aliases of the commands that absorbed them", () => {
    const owner = new Map(cmds.flatMap((c) => c.aliases.map((a) => [a, c.name] as const)));
    for (const [alias, name] of [
      ["reset-session", "clear"], ["version", "status"], ["env", "status"], ["session", "status"],
      ["upgrade", "status"], ["ctx-viz", "context"], ["extra-usage", "usage"],
    ]) strictEqual(owner.get(alias), name, `/${alias} must stay an alias of /${name}`);
  });

  it("every name matches the loader's kebab-case rule", () => {
    for (const c of cmds) match(c.name, /^[a-z][a-z0-9-]*$/, `${c.file}: '${c.name}'`);
  });

  it("file slug matches the declared name (gap-round diff counts slugs)", () => {
    for (const c of cmds) {
      strictEqual(c.file.replace(/\.cmd\.ts$/, ""), c.name, `${c.file} declares '${c.name}'`);
    }
  });

  it("E-1 wave commands are all present", () => {
    const names = new Set(cmds.map((c) => c.name));
    for (const n of [
      "clear", "exit", "config", "model", "plan", "permissions", "summary",
      "resume", "rewind", "usage", "feedback", "hooks",
      "skills", "tasks", "copy",
      "effort", "fast", "passes", "proactive", "verify",
    ]) ok(names.has(n), `missing E-1 command: ${n}`);
  });

  it("B-12 commands are all present", () => {
    const names = new Set(cmds.map((c) => c.name));
    for (const n of ["advisor", "agents", "debug-tool-call", "security-review", "output-style"]) {
      ok(names.has(n), `missing B-12 command: ${n}`);
    }
  });

  it("help is deliberately NOT scripted (built-in lists both registries)", () => {
    ok(!cmds.some((c) => c.name === "help"));
  });
});

describe("the loader cap covers the whole surface (B-8 probe finding)", () => {
  // The loader keeps the FIRST Orkeon:Cli:ScriptCommands:MaxScripts command files
  // in discovery order and drops the rest with one `warn` line: at 51 commands,
  // under the old default of 50, the REPL quietly booted without /version. The
  // default is 200 since Orkeon rc.6, so the launchers no longer raise it; this
  // keeps the surface under it, so the command that crosses it fails here.
  it("the command files stay under Orkeon's default cap of 200", () => {
    ok(collect().length < 200, `${collect().length} command files reach the loader's default cap`);
  });
});

describe("no top-level export in a *.cmd.ts (B-7 regression)", () => {
  // `/output-style` shipped with `export const OUTPUT_STYLE_STATE_KEY` and simply
  // WAS NOT THERE at runtime: the loader bundles each file and Jint evaluates it in
  // SCRIPT mode, where a top-level `export` is a syntax error —
  //   Failed to load scripted command file /cli-commands/output-style.cmd.ts
  //   Jint.Runtime.JavaScriptException: Unexpected token 'export'
  // The unit tests were green and the esbuild bundle was clean; only a live REPL
  // load surfaced it. The failure mode is the worst kind: a command that reports
  // nothing and is absent from /help, while every offline check passes.
  it("declares no top-level export, in any command file", () => {
    for (const { file } of collect()) {
      const src = readFileSync(join(COMMANDS_DIR, file), "utf-8");
      const offenders = src
        .split("\n")
        .map((line, i) => ({ line: line.trimEnd(), n: i + 1 }))
        .filter(({ line }) => /^export\b/.test(line));
      strictEqual(
        offenders.length, 0,
        `${file} has a top-level export at line ${offenders[0]?.n} (${offenders[0]?.line}) — ` +
        "Jint evaluates command files in script mode and will refuse to load it",
      );
    }
  });

  it("covers every command file, so the rule cannot be dodged by adding one", () => {
    ok(collect().length >= EXPECTED_COMMAND_COUNT);
  });
});
