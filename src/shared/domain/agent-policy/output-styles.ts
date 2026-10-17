// The output styles /output-style accepts and the prompt assembly renders —
// pure, no IO. A style the assembly cannot render is not settable.

export const OUTPUT_STYLES = ["default", "concise", "explanatory", "learning"] as const;

export function isOutputStyle(token: unknown): boolean {
  return (OUTPUT_STYLES as readonly string[]).includes(String(token ?? ""));
}
