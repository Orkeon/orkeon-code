// Typed bridge to the runtime globals injected by Orkeon.Scripting.Cli /
// Orkeon.Cli.Scripting (Jint engine). Declared ONCE here and re-exported as
// typed aliases so the rest of the codebase never writes `(globalThis as any)`.
// Esbuild bundles every module into a single script for Jint, so these
// declarations resolve at runtime against the engine's globalThis.
//
// This is the ONLY module allowed to reach into the runtime globals — the
// source-layer analogue of the C# "all IO through IFileSystemService" rule.
// (Mirrors exp 02 crews/unified/infrastructure/globals.ts.)
//
// `Tools` is typed (OrkeonTools plus the local declarations of orkeon/runtime-tools.ts)
// and read by the adapters of orkeon/ and by entry points only.

declare const agentBuilder: () => any;
declare const crewBuilder: () => any;
declare const toolBuilder: () => ToolBuilder<unknown, unknown>;

/** `tools.<camelCase>(args)` namespace bridging IBaseTool implementations, as the
 *  generated typings declare it: every built-in tool typed (Orkeon #125). */
export const Tools: OrkeonTools = tools;
/** Domain DSL: build an agent. */
export const AgentBuilder: () => any = agentBuilder;
/** Domain DSL: build a crew. */
export const CrewBuilder: () => any = crewBuilder;
/** Domain DSL: build a tool Orkeon Code defines (orkeon/script-tools.ts). */
export const ToolBuilder: () => ToolBuilder<unknown, unknown> = toolBuilder;

/** The RAG namespace (`rag.retrieve`, `rag.ingest`), or undefined when the host declares none (it needs
 *  AddOrkeonRag): orkeon/shared-memory.ts then calls the rag_search and rag_ingest tools. */
export const Rag: typeof rag | undefined = typeof rag === "undefined" ? undefined : rag;

/** The `llm` namespace (`llm.profile`, `llm.default_`), or undefined where the host declares none (a command
 *  engine): orkeon/llm-profile.ts builds an agent on the profile the crew input names. */
export const Llm: typeof llm | undefined = typeof llm === "undefined" ? undefined : llm;

/** Typed accessor for `globalThis.inputs` (crew/command invocation payload).
 *
 *  ⚠️ The implementation binding is deliberately NOT named `inputs`: esbuild
 *  bundles to a flat esm script that Jint evaluates in SCRIPT mode, where a
 *  top-level `function inputs()` becomes a GLOBAL binding and clobbers the
 *  `globalThis.inputs` object the host injects before evaluation (`--inputs`
 *  then reads back as the function itself → empty payload). Exporting under
 *  the public name keeps every call site unchanged. */
function readInputs<T = Record<string, any>>(): T {
  return ((globalThis as any).inputs ?? {}) as T;
}
export { readInputs as inputs };

/** Publish the assembled crew back to the runtime (`globalThis.crew = ...`). */
export function publishCrew(crew: any): void {
  (globalThis as any).crew = crew;
}
