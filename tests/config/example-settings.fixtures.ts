// The example settings of config/, as the tests read them.
import { readFileSync, readdirSync } from "node:fs";

const CONFIG_DIR = new URL("../../config/", import.meta.url);

/** Every config/*.example.json, sorted. */
export function listExamples(): string[] {
  return readdirSync(CONFIG_DIR).filter((name) => name.endsWith(".example.json")).sort();
}

export const load = (name: string): any => JSON.parse(readFileSync(new URL(name, CONFIG_DIR), "utf8"));

/** The examples the documentation promises. */
export const PROMISED_EXAMPLES: readonly string[] = [
  "appsettings.example.json", "appsettings.anthropic.example.json", "appsettings.ollama.example.json",
  "appsettings.ollama-whisper.example.json", "appsettings.jev.example.json",
];

/** The settings but for their comment, their Llm:Profiles and the two sections of the decision model. */
export function withoutCommentProfilesAndDecision(settings: any): Record<string, unknown> {
  const { _comment, Llm: { Profiles, ...llm }, Orkeon: { TypeSafe, Decision, ...orkeon }, ...rest } = settings;
  return { ...rest, Llm: llm, Orkeon: orkeon };
}

/** The keys opening with `_` below the root of `node`, as `Section:Key` paths. */
export function commentKeysBelowRoot(node: unknown, path: string[] = [], found: string[] = []): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return found;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = [...path, key];
    if (path.length > 0 && key.startsWith("_")) found.push(here.join(":"));
    commentKeysBelowRoot(value, here, found);
  }
  return found;
}

/** The settings but for their comment and their Llm section. */
export const withoutCommentAndLlm = ({ _comment, Llm, ...rest }: Record<string, unknown>) => rest;

/** The settings but for their comment, their Orkeon section and their MCP section. */
export const withoutCommentOrkeonAndMcp = ({ _comment, Orkeon, MCP, ...rest }: Record<string, unknown>) => rest;

/** The result cut the examples state, at the runtime's defaults. */
export const RESULT_LIMITS = { MaxParallelToolCalls: 4, Limits: { shell_command: 10000 } };
