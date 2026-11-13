// An error as one line of text: the whole message, its line breaks and runs of blanks made single spaces, cut at
// ERROR_TEXT_CHARS. A model's reply the runtime could not parse is quoted after a line break ("Raw: {\n  …"), so
// keeping the first line alone dropped what was wrong with it, for the person and for the re-ask. Pure.

export const ERROR_TEXT_CHARS = 400;

/** The message of `error` (an Error's, else its string), on one line, at most ERROR_TEXT_CHARS characters. */
export function errorText(error: unknown): string {
  const flat = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
  return flat.length <= ERROR_TEXT_CHARS ? flat : `${flat.slice(0, ERROR_TEXT_CHARS - 1)}…`;
}
