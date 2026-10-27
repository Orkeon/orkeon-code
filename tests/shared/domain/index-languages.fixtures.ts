// The registry's grammars as the index-languages tests expect them.

/** Read from src/analysis/Orkeon.Analysis/TreeSitter/LanguageRegistry.cs (Orkeon 947d3215): a grammar added
 *  framework-side must be mirrored in index-languages.ts. */
export const REGISTRY_GRAMMARS: readonly string[] = [
  "typescript", "python", "csharp", "go", "rust", "javascript", "java", "c", "cpp", "php", "ruby", "bash",
  "markdown", "tsx", "agda", "css", "embedded-template", "haskell", "html", "json", "julia", "ql", "razor",
  "scala", "verilog",
];

/** The grammars whose files the path validator refuses to read, so no index asks for them. */
export const BLOCKED_GRAMMARS: readonly string[] = ["bash"];

/** Grammars an index must keep asking for: the code of the dev fixtures and the documentation. */
export const KEPT_GRAMMARS: readonly string[] = ["typescript", "javascript", "csharp", "markdown", "json"];
