import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../../scripts/release-notes.mjs", import.meta.url).pathname;

export const SHORT_CHANGELOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "## [2.0.0] - 2026-11-06",
  "",
  "### Fixed",
  "",
  "- the new entry",
  "",
  "## [1.0.0]",
  "",
  "- the old entry",
  "",
].join("\n");

/** A changelog whose section 2.0.0 holds `count` lines of 100 characters. */
export function longChangelog(count: number, filler = "x"): string {
  const line = `- ${filler.repeat(98)}`;
  return `## [2.0.0]\n\n${Array.from({ length: count }, () => line).join("\n")}\n\n## [1.0.0]\n\n- the old entry\n`;
}

export function runReleaseNotes(version: string, changelog: string): { status: number | null; stdout: string } {
  const path = join(mkdtempSync(join(tmpdir(), "release-notes-")), "CHANGELOG.md");
  writeFileSync(path, changelog);
  const { status, stdout } = spawnSync(process.execPath, [SCRIPT, version, path], { encoding: "utf-8" });
  return { status, stdout };
}
