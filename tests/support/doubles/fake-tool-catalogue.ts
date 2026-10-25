// FakeToolCatalogue: the ToolCatalogue port, registered name → reply: a value, or
// a function of the arguments; an Error reply is thrown, as a failing tool throws.
// Names are found case-insensitively, as Orkeon finds them. Every call lands in
// `calls` under the registered name.
import type { ToolCatalogue } from "../../../src/shared/application/ports.ts";

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
}
