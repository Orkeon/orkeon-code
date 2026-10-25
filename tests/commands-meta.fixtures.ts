// What the sources hold today, read for the commands/_lib/meta.ts tests.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The number of slash commands: the `.cmd.ts` files under src/commands. */
export function commandCount(): number {
  const dir = fileURLToPath(new URL("../src/commands", import.meta.url));
  return readdirSync(dir, { recursive: true, encoding: "utf-8" }).filter((f) => f.endsWith(".cmd.ts")).length;
}

/** The crew directories of src/crews, the hidden and `_` ones left out. */
export function crewNames(): string[] {
  const dir = fileURLToPath(new URL("../src/crews", import.meta.url));
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .map((d) => d.name);
}

export const META_SOURCE = fileURLToPath(new URL("../src/commands/_lib/meta.ts", import.meta.url));
