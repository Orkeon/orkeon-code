// Small text helpers shared by the dev-verify crew: the first line of a message, the lines of
// a command's stdout, and a cut with an ellipsis. Pure.

/** The first line of `text`, trimmed; "" for an empty text. */
export function firstLine(text: string): string {
  return (text.split("\n")[0] ?? "").trim();
}

/** The lines of a stdout split on "\n" (a "\r" before it dropped), the trailing empty line dropped. */
export function stdoutLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** `text` as is when it holds `max` characters or fewer, else its first `max - 1` and "…". */
export function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
