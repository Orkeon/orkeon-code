// The whitespace `git diff --check` refuses, put right by code in a file a role wrote: trailing
// spaces or tabs at the end of a line, blank lines at the end of the file. A node insert at the end
// of a module leaves a blank line after the last member; the gate would stop the batch for it. Pure.

export interface TidyResult {
  text: string;
  /** What changed, one phrase each ("trailing whitespace on 2 lines", "a blank line at EOF removed"); empty: nothing. */
  fixed: string[];
}

/** `text` without trailing whitespace on its lines nor blank lines at its end (its final newline kept as it was). */
export function tidyWhitespace(text: string): TidyResult {
  const fixed: string[] = [];
  const lines = text.split("\n");
  let trailing = 0;
  const stripped = lines.map((line) => {
    const clean = line.replace(/[ \t]+$/u, "");
    if (clean !== line) trailing += 1;
    return clean;
  });
  if (trailing > 0) fixed.push(`trailing whitespace on ${trailing} line${trailing === 1 ? "" : "s"}`);
  const endsWithNewline = text.endsWith("\n");
  // The split's last element is "" when the text ends with a newline: the blank lines at EOF are the empty
  // elements before it.
  let end = stripped.length - (endsWithNewline ? 1 : 0);
  let blank = 0;
  while (end > 1 && stripped[end - 1] === "") {
    end -= 1;
    blank += 1;
  }
  if (blank > 0) fixed.push(blank === 1 ? "a blank line at EOF removed" : `${blank} blank lines at EOF removed`);
  const body = stripped.slice(0, end).join("\n");
  return { text: endsWithNewline ? `${body}\n` : body, fixed };
}
