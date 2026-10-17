// Prompt + schema builders for init-verifiers. Pure strings — no IO.

/** JSON schema for the test-readiness classification. */
export const READINESS_SCHEMA = {
  type: "object",
  properties: {
    appTypes: { type: "array", items: { type: "string" } },   // web | cli | api | library
    frameworks: { type: "array", items: { type: "string" } },
    hasUnitTests: { type: "boolean" },
    hasE2E: { type: "boolean" },
    zonesNeedingVerifier: { type: "array", items: { type: "string" } },
  },
};

/** Prompt that classifies the project + its test readiness as JSON. */
export function buildReadinessPrompt(names: string[], pkg: string): string {
  return (
    "Classify this project and its test readiness. Respond with ONLY a JSON object, no prose.\n\n" +
    `Top-level: ${names.slice(0, 60).join(", ")}\n\npackage.json:\n${pkg}`
  );
}

/** Prompt that authors a verification skill (markdown) for one zone. */
export function buildVerifierSkillPrompt(zone: string): string {
  return (
    `Author a concise verification skill (markdown) describing how to verify the "${zone}" zone of this project. ` +
    `Include prerequisites, steps, and pass/fail criteria. Markdown only.`
  );
}
