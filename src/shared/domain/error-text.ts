// An error as one line of text: the whole message, its line breaks and runs of blanks made single spaces, cut at
// ERROR_TEXT_CHARS. A model's reply the runtime could not parse is quoted with its line breaks, so keeping the first
// line alone dropped what was wrong with it, for the person and for the re-ask. Since Orkeon #353 that message gives
// the JSON error, the finish reason and the tokens, then the first and the last 200 characters of the reply: about
// 850 characters at most, so the cut leaves room for all of it, the end of a reply cut short included. Pure.

export const ERROR_TEXT_CHARS = 1200;

/** The message of `error` (an Error's, else its string), on one line, at most ERROR_TEXT_CHARS characters. */
export function errorText(error: unknown): string {
  const flat = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
  return flat.length <= ERROR_TEXT_CHARS ? flat : `${flat.slice(0, ERROR_TEXT_CHARS - 1)}…`;
}
