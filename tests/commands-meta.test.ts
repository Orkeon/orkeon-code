// The CLI metadata of commands/_lib/meta.ts (/version, /release-notes, /upgrade,
// /onboarding), pinned to the sources so it cannot go stale (B-11 audit). Run:
//   node --test tests/commands-meta.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CLI_VERSION, RELEASE_NOTES } from "../src/commands/_lib/meta.ts";

describe("B-11 audit — the metadata that had gone stale", () => {
  const COMMANDS_DIR = fileURLToPath(new URL("../src/commands", import.meta.url));
  const commandCount = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".cmd.ts")).length;

  it("RELEASE_NOTES states the CURRENT command count", () => {
    // It advertised "50 slash commands" three waves after 50. /release-notes and
    // /version are the one place an operator goes to ask what they are running, so
    // a stale number there is worse than no number.
    ok(RELEASE_NOTES.includes(`${commandCount} slash commands`),
      `RELEASE_NOTES must say "${commandCount} slash commands"`);
  });

  it("RELEASE_NOTES names the version it is notes for", () => {
    ok(RELEASE_NOTES.includes(CLI_VERSION));
  });

  it("no longer claims to mirror the framework version", () => {
    // meta.ts said it mirrored src/Directory.Build.props while that file read
    // 0.9.2-beta. The two version independently; the header now says so.
    const src = readFileSync(fileURLToPath(new URL("../src/commands/_lib/meta.ts", import.meta.url)), "utf-8");
    strictEqual(/Version mirrors src\/Directory\.Build\.props/.test(src), false);
  });

  it("names every crew directory in the notes", () => {
    const CREWS_DIR = fileURLToPath(new URL("../src/crews", import.meta.url));
    const crews = readdirSync(CREWS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
      .map((d) => d.name);
    for (const crew of crews) ok(RELEASE_NOTES.includes(crew), `RELEASE_NOTES omits crew '${crew}'`);
  });
});
