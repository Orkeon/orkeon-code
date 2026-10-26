/// <reference path="../../../src/crews/.orkeon/orkeon.d.ts" />
// The recording tool builder the script tools and the memory tools are tested with: each tool built lands in `built`
// with what the builder was told, and its execute calls the body it was given.
import type { ToolBuilderFactory } from "../../../src/shared/infrastructure/orkeon/script-tools.ts";

export interface Built { name?: string; description?: string; schema?: JsonSchema; access?: string; fn?: (input: unknown) => unknown }

/** A builder that records what it is told, and builds a tool whose execute calls the body. */
export function recorder(): { builder: ToolBuilderFactory; built: Built[] } {
  const built: Built[] = [];
  const builder = () => {
    const b: Built = {};
    built.push(b);
    const api: any = {
      name: (v: string) => { b.name = v; return api; },
      description: (v: string) => { b.description = v; return api; },
      withSchema: (v: JsonSchema) => { b.schema = v; return api; },
      access: (v: string) => { b.access = v; return api; },
      execute: (fn: (input: unknown) => unknown) => { b.fn = fn; return api; },
      build: () => ({ name: b.name, description: b.description, execute: (input: unknown) => b.fn!(input) }),
    };
    return api as ToolBuilder<unknown, unknown>;
  };
  return { builder, built };
}
