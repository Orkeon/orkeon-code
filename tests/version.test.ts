// The version an operator reads (/version, /release-notes) is the version that was
// released: meta.ts, package.json and the pins of the runtime must agree. Every
// crew declares the script version it is written for, in the form tsc reads as a
// comment (Orkeon's VersionDirectiveParser reads it too).
import { describe, it } from "node:test";
import { strictEqual, match, ok } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_VERSION } from "../src/commands/_lib/meta.ts";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

describe("versions", () => {
  it("meta.ts CLI_VERSION equals package.json version", () => {
    strictEqual(CLI_VERSION, JSON.parse(read("../package.json")).version);
  });

  it(".orkeon-version is one exact Orkeon version", () => {
    match(read("../.orkeon-version").trim(), /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
  });

  it("the orkeon tool manifest pins the same Orkeon version as .orkeon-version", () => {
    const manifest = JSON.parse(read("../.config/dotnet-tools.json"));
    strictEqual(manifest.tools["orkeon.scripting.cli"].version, read("../.orkeon-version").trim());
  });

  it("global.json pins the .NET SDK as Orkeon does: 10.0.300, latest feature band", () => {
    const sdk = JSON.parse(read("../global.json")).sdk;
    strictEqual(sdk.version, "10.0.300");
    strictEqual(sdk.rollForward, "latestFeature");
  });

  it("every crew and probe opens with `// @orkeon-script 1.0`", () => {
    const crews = fileURLToPath(new URL("../src/crews/", import.meta.url));
    const scripts = readdirSync(crews, { recursive: true, encoding: "utf-8" }).filter((f: string) => f.endsWith(".ork.ts"));
    ok(scripts.length > 0, "no .ork.ts under src/crews");
    for (const f of scripts) strictEqual(readFileSync(join(crews, f), "utf-8").split("\n")[0], "// @orkeon-script 1.0", f);
  });
});
