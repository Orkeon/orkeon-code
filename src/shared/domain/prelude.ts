// A prelude: one tool call a command asks a crew to make before its own work.
// /transcribe hands the crews a speech-to-text call this way: the crew makes it
// as the command's call (the user typed the command, so the gate does not ask),
// where a call may last minutes, which a command's handler cannot (the engine
// bounds the promise it awaits at 10 s). Pure: the shape of the input, the text
// of a tool result, and the request the model reads once the call answered.

/** The call: the registered tool name, its arguments, and what to call its result.
 *  `as: "request"` makes the result the request itself (/voice --go dictates it);
 *  otherwise the result follows the request under its label. */
export interface PreludeCall {
  tool: string;
  args: Record<string, unknown>;
  label: string;
  as?: "request";
}

/** What a tool that answered no text is reported as. */
export function nothingReturned(tool: string): string {
  return `${tool} returned nothing`;
}

/** The prelude of a crew input; null when there is none or it names no tool.
 *  Arguments that are not an object count as none; a blank label is the tool's name. */
export function parsePrelude(value: unknown): PreludeCall | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const tool = typeof fields.tool === "string" ? fields.tool.trim() : "";
  if (tool.length === 0) return null;
  const args = fields.args !== null && typeof fields.args === "object" && !Array.isArray(fields.args)
    ? (fields.args as Record<string, unknown>)
    : {};
  const label = typeof fields.label === "string" && fields.label.trim().length > 0 ? fields.label.trim() : tool;
  return fields.as === "request" ? { tool, args, label, as: "request" } : { tool, args, label };
}

/** A call a command asks a crew to make after its work, with the answer, before the
 *  work returns: the answer shows once the call is done (speak returns as soon as the
 *  audio is synthesized, and plays it in the background), and a failure never fails
 *  the work. voice.reply hands the main loop speak this way: `args` plus the answer
 *  under `textArg`. */
export interface EpilogueCall {
  tool: string;
  args: Record<string, unknown>;
  textArg: string;
  label: string;
}

/** The epilogue of a crew input; null when there is none or it names no tool. A blank
 *  `textArg` is "text", a blank label the tool's name. */
export function parseEpilogue(value: unknown): EpilogueCall | null {
  const call = parsePrelude(value);
  if (call === null) return null;
  const fields = value as Record<string, unknown>;
  const textArg = typeof fields.textArg === "string" && fields.textArg.trim().length > 0 ? fields.textArg.trim() : "text";
  return { tool: call.tool, args: call.args, textArg, label: call.label };
}

/** The arguments of the epilogue's call: its own, and the answer under `textArg`. */
export function epilogueArgs(epilogue: EpilogueCall, answer: string): Record<string, unknown> {
  return { ...epilogue.args, [epilogue.textArg]: answer };
}

/** A tool result as text: a string as it is; else the first string field among
 *  text, content and result (either case); else its JSON; nothing for no result. */
export function resultText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") {
    for (const key of ["text", "content", "result", "Text", "Content", "Result"]) {
      const field = (raw as Record<string, unknown>)[key];
      if (typeof field === "string") return field;
    }
  }
  return JSON.stringify(raw);
}

/**
 * A failed tool call as one readable line: the tool's own message, without what the
 * runtime wraps it in ("One or more errors occurred. (tools.transcribeAudio failed
 * [path=…]: Error executing tool transcribe_audio: …)").
 */
export function failureText(error: unknown): string {
  let text = (error instanceof Error ? error.message : String(error)).trim();
  const executing = /Error executing tool [\w.-]+: ([\s\S]*)$/.exec(text);
  const failed = /tools\.\w+ failed \[[^\]]*\]: ([\s\S]*)$/.exec(text);
  if (executing) text = executing[1];
  else if (failed) text = failed[1];
  text = text.split("\n")[0].trim();
  const count = (c: string) => text.split(c).length - 1;
  while (text.endsWith(")") && count(")") > count("(")) text = text.slice(0, -1);
  return text.trim();
}

/** The error a failed call becomes: named after the tool, so the run's failure
 *  reads "<tool>: <the tool's message>", the way an LlmFailure reads. */
export function toolFailure(tool: string, error: unknown): Error {
  const failure = new Error(failureText(error));
  failure.name = tool;
  return failure;
}

/** The request the model reads: the user's request, then the prelude's result under its label. */
export function withPrelude(request: string, label: string, text: string): string {
  return `${request.trim()}\n\n${label}:\n${text.trim()}`;
}

/** The request once the prelude answered: its text itself for `as: "request"` (after the
 *  request typed, if any), else the request followed by the text under the label. */
export function applyPrelude(request: string, prelude: PreludeCall, text: string): string {
  if (prelude.as === "request") return [request.trim(), text.trim()].filter((part) => part.length > 0).join("\n\n");
  return withPrelude(request, prelude.label, text);
}
