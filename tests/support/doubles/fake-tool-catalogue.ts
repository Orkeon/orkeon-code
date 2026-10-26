// FakeToolCatalogue: the ToolCatalogue port, registered name → reply: a value, or
// a function of the arguments; an Error reply is thrown, as a failing tool throws.
// Names are found case-insensitively, as Orkeon finds them. Every call lands in
// `calls` under the registered name. `callText` reads a reply as the adapter does
// (resultText), without the runtime's failure wrapping: an Error is its message.
import type { ToolCatalogue, ToolOutcome } from "../../../src/shared/application/ports.ts";

export class FakeToolCatalogue implements ToolCatalogue {
  tools = new Map<string, unknown>();
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  names(): string[] {
    return [...this.tools.keys()].sort();
  }

  find(name: string): string | undefined {
    return [...this.tools.keys()].find((registered) => registered.toLowerCase() === name.toLowerCase());
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const registered = this.find(name);
    if (registered === undefined) throw new Error(`no registered tool '${name}'`);
    this.calls.push({ name: registered, args });
    const reply = this.tools.get(registered);
    const value = typeof reply === "function" ? reply(args) : reply;
    if (value instanceof Error) throw value;
    return value;
  }

  async callText(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    try {
      return { ok: true, text: replyText(await this.call(name, args)) };
    } catch (error) {
      return { ok: false, failure: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** A reply as text, as the adapter's resultText reads it: a string as it is; nothing for no reply;
 *  else the first string field among text, content and result (either case); else its JSON. */
function replyText(reply: unknown): string {
  if (typeof reply === "string") return reply;
  if (reply === null || reply === undefined) return "";
  if (typeof reply === "object") {
    for (const key of ["text", "content", "result", "Text", "Content", "Result"]) {
      const field = (reply as Record<string, unknown>)[key];
      if (typeof field === "string") return field;
    }
  }
  return JSON.stringify(reply);
}
