// What the sources hold today, read for the commands/_lib/status/meta.ts tests.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ORKEON_RUNTIME_COMMIT } from "../../../../src/commands/_lib/status/meta.ts";

/** The number of slash commands: the `.cmd.ts` files under src/commands. */
export function commandCount(): number {
  const dir = fileURLToPath(new URL("../../../../src/commands", import.meta.url));
  return readdirSync(dir, { recursive: true, encoding: "utf-8" }).filter((f) => f.endsWith(".cmd.ts")).length;
}

/** The crew directories of src/crews, the hidden and `_` ones left out. */
export function crewNames(): string[] {
  const dir = fileURLToPath(new URL("../../../../src/crews", import.meta.url));
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .map((d) => d.name);
}

export const META_SOURCE = fileURLToPath(new URL("../../../../src/commands/_lib/status/meta.ts", import.meta.url));

/** The commit a runtime reports, and whether it is the pin of .orkeon-version. */
export const PINNED_COMMIT_CASES: readonly { name: string; commit: string | null; pinned: boolean }[] = [
  { name: "the full pinned commit is the pin", commit: ORKEON_RUNTIME_COMMIT, pinned: true },
  { name: "the pinned commit cut at seven characters is the pin", commit: ORKEON_RUNTIME_COMMIT.slice(0, 7), pinned: true },
  { name: "the pinned commit cut at twelve characters is the pin", commit: ORKEON_RUNTIME_COMMIT.slice(0, 12), pinned: true },
  { name: "a prefix shorter than seven characters is not the pin", commit: ORKEON_RUNTIME_COMMIT.slice(0, 6), pinned: false },
  { name: "the pinned commit in upper case is not the pin: git prints lower case", commit: ORKEON_RUNTIME_COMMIT.toUpperCase(), pinned: false },
  { name: "a build at the pin with local changes is not the pin", commit: `${ORKEON_RUNTIME_COMMIT}-dirty`, pinned: false },
  { name: "another commit is not the pin", commit: "0123456789abcdef0123456789abcdef01234567", pinned: false },
  { name: "a runtime reporting no commit is not the pin", commit: null, pinned: false },
];
