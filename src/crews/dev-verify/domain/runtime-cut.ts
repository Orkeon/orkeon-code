// The cut Orkeon applies to a tool result: the text is cut at the tool's limit and ends with a
// notice of how many characters were omitted (ToolResultLimitsOptions.Cut). Pure.

/** The notice Orkeon appends to a cut tool result (ToolResultLimitsOptions.Cut). */
const NOTICE = /\n\n\[\.\.\. truncated, (\d+) chars omitted\. Use more specific parameters to narrow results\.\]$/;

/** The text without the notice, and how many characters the runtime omitted (0: not cut). */
export function runtimeCut(text: string): { kept: string; omitted: number } {
  const match = NOTICE.exec(text);
  const omitted = match === null ? 0 : Number(match[1]);
  if (match === null || omitted === 0) return { kept: text, omitted: 0 };
  return { kept: text.slice(0, match.index), omitted };
}
