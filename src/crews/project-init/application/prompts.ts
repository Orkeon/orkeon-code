// Prompt + schema builders for project-init. Pure strings — no IO.

/** JSON schema for the convention-extract call. */
export const CONVENTIONS_SCHEMA = {
  type: "object",
  properties: {
    buildCommand: { type: "string" },
    testCommand: { type: "string" },
    lintCommand: { type: "string" },
    frameworks: { type: "array", items: { type: "string" } },
    conventions: { type: "array", items: { type: "string" } },
  },
};

/** Prompt that asks the model to infer build/test/lint + frameworks as JSON. */
export function buildConventionsPrompt(configText: string): string {
  return (
    "From the config files below, infer the project's build/test/lint commands, frameworks, and " +
    "conventions. Respond with ONLY a JSON object, no prose.\n\n" +
    configText
  );
}

/** Prompt that asks the model to author the CLAUDE.md body (markdown only). */
export function buildClaudeMdPrompt(names: string[], detected: any): string {
  return (
    "Write a concise, accurate CLAUDE.md for this repository. Include: project overview, " +
    "build/test/lint commands, directory layout, and conventions. Markdown only, no preamble.\n\n" +
    `Top-level entries: ${names.slice(0, 60).join(", ")}\n\n` +
    `Detected: ${JSON.stringify(detected)}`
  );
}
