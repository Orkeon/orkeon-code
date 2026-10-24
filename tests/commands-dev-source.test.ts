// /dev-spec and /dev-change: their arguments (commands/_lib/dev-source.ts), and that each step runs in a crew of its
// own - the fork of the conversation the harness's skills asked for (runsIn: fork) - never in main-loop.
// Run:  node --test tests/commands-dev-source.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { DEV_CHANGE_USAGE, DEV_SPEC_USAGE, parseDevChangeArgs, parseDevSpecArgs } from "../src/commands/_lib/dev-source.ts";

/** The tokens the REPL hands over: the line split on spaces, quotes kept. */
const tokens = (line: string): string[] => line.split(" ").filter((t) => t !== "");

describe("parseDevSpecArgs", () => {
  it("reads the code and the brief as typed", () => {
    deepStrictEqual(parseDevSpecArgs(tokens("prune Remove old entries, keep feedback.")),
      { ok: true, args: { code: "prune", request: "Remove old entries, keep feedback." } });
    deepStrictEqual(parseDevSpecArgs(tokens("prune")), { ok: true, args: { code: "prune", request: "" } });
    deepStrictEqual(parseDevSpecArgs(tokens('prune "one quoted brief"')), { ok: true, args: { code: "prune", request: "one quoted brief" } });
  });

  it("refuses no code, a bad code and an option", () => {
    deepStrictEqual(parseDevSpecArgs([]), { ok: false, text: DEV_SPEC_USAGE });
    const bad = parseDevSpecArgs(tokens("../x brief"));
    ok(!bad.ok && bad.text.startsWith("'../x' is not a code"));
    const opt = parseDevSpecArgs(tokens("prune --replace"));
    ok(!opt.ok && opt.text.startsWith("unknown option --replace"));
  });
});

describe("parseDevChangeArgs", () => {
  it("reads the kind, a quoted --run command whole, and the origin", () => {
    deepStrictEqual(parseDevChangeArgs(tokens('cache bug --run "node --test tests/map.test.ts" #42')),
      { ok: true, args: { code: "cache", kind: "bug", run: "node --test tests/map.test.ts", text: "#42" } });
    deepStrictEqual(parseDevChangeArgs(tokens("cache refactor The map is read on every call.")),
      { ok: true, args: { code: "cache", kind: "refactor", run: "", text: "The map is read on every call." } });
    deepStrictEqual(parseDevChangeArgs(tokens("cache also pin the absent map")),
      { ok: true, args: { code: "cache", kind: "", run: "", text: "also pin the absent map" } });
  });

  it("refuses --run without its command, after the origin, or another option", () => {
    const a = parseDevChangeArgs(tokens("cache bug --run"));
    ok(!a.ok && a.text.startsWith("--run needs the command"));
    const b = parseDevChangeArgs(tokens('cache bug the map --run "x"'));
    ok(!b.ok && b.text.startsWith("--run comes before the origin"));
    const c = parseDevChangeArgs(tokens("cache bug --replace"));
    ok(!c.ok && c.text.startsWith("unknown option --replace"));
    deepStrictEqual(parseDevChangeArgs([]), { ok: false, text: DEV_CHANGE_USAGE });
  });
});

describe("runsIn: fork — each step launches its own crew", () => {
  for (const step of ["dev-spec", "dev-change"]) {
    it(`/${step} starts the dev step and launches the ${step} crew, never main-loop`, () => {
      const src = readFileSync(new URL(`../src/commands/${step}.cmd.ts`, import.meta.url), "utf8");
      ok(src.includes(`startDevStep("${step}"`));
      ok(new RegExp(`launchCrew\\([\\s\\S]*"${step}"`).test(src));
      strictEqual(src.includes("main-loop"), false);
      ok(src.includes("maxConcurrent: 1"));
    });
  }
});
