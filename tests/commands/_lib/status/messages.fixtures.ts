// What the sources hold today, read for the commands/_lib/status/messages.ts tests.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

/** The Orkeon version `.config/dotnet-tools.json` names for the `orkeon` tool, the runtime the notes say they run on. */
export function orkeonToolVersion(): string {
  const file = fileURLToPath(new URL("../../../../.config/dotnet-tools.json", import.meta.url));
  const manifest = JSON.parse(readFileSync(file, "utf-8")) as { tools: Record<string, { version: string }> };
  return manifest.tools["orkeon.scripting.cli"].version;
}

/** The facts the notes must state besides the counts: the Orkeon release the tool manifest installs, named as that
 *  and not as the runtime the pin is (a commit of Orkeon's main past it), and the headless runner. */
export function runtimeFacts(): string[] {
  return [`past Orkeon ${orkeonToolVersion()} (the release the tool manifest installs)`, "Headless: orkeon-code run <crew>"];
}
