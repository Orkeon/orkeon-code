// Which search surface covers which file — pure, no IO.
//
// The two indexes cover DISJOINT ground, and neither reports the other's blind
// side: the RaggableTree parses exactly the Tree-sitter adapters' extensions and
// silently skips everything else (a `.md` never enters `codebase_search`'s world),
// while the RAG document store only holds what was explicitly `rag_ingest`ed. A
// model told "search the codebase" with no routing rule picks one tool, gets an
// empty answer on the other half, and concludes the content does not exist.
//
// So the rule is DETERMINISTIC, by extension:
//   code (tree)      → codebase_search / symbol_source / flow_trace
//   documents (rag)  → rag_search on the workspace-docs collection
//   unknown          → rag (the tree cannot parse it by construction; the RAG's
//                      text loader reads any UTF-8 body, so it is the side with
//                      a chance — and rag_ingest fails loudly instead of lying)

/**
 * Extensions the RaggableTree parses — the union of the five Tree-sitter
 * adapters' `FileExtensions` (TypeScript/C#/Python/Go/Rust), read from
 * `src/analysis/Orkeon.Analysis/Adapters/*.cs`. A new adapter framework-side
 * must be mirrored here; the probe's partition step is the tripwire.
 */
export const TREE_CODE_EXTENSIONS: readonly string[] = [
  ".ts", ".tsx", ".cs", ".py", ".go", ".rs",
];

/**
 * Extensions the RAG document loaders accept, per loader (read from
 * `src/rag/Orkeon.Rag/Loaders/*.cs`): text/markdown, CSV, HTML, PDF.
 */
export const RAG_DOCUMENT_EXTENSIONS: readonly string[] = [
  ".txt", ".md", ".markdown", ".text", ".log",
  ".csv", ".html", ".htm", ".pdf",
];

/** The collection where the workspace's non-code files get ingested. */
export const WORKSPACE_DOCS_COLLECTION = "workspace-docs";

export type SearchSurface = "tree" | "rag";

/** Lowercased extension of a path, "" when there is none. */
export function extensionOf(path: string): string {
  const name = String(path ?? "").split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * The surface that covers a path. Everything the tree does not parse routes to
 * the RAG — including unknown extensions: the tree CANNOT hold them (its
 * discovery filters by adapter extension), so sending the query there would
 * manufacture a guaranteed-empty answer that reads as "not found".
 */
export function routeForPath(path: string): SearchSurface {
  return TREE_CODE_EXTENSIONS.includes(extensionOf(path)) ? "tree" : "rag";
}

/** True when a RAG loader is DECLARED for this extension (ingestion will parse it). */
export function hasRagLoader(path: string): boolean {
  return RAG_DOCUMENT_EXTENSIONS.includes(extensionOf(path));
}

/**
 * The playbook's routing paragraph — kept here so the prompt text and the rule
 * cannot drift apart (the prompt renders THIS, tests pin THIS).
 */
export function describeSearchRouting(): string {
  return (
    `- Code (${TREE_CODE_EXTENSIONS.join(" ")}): \`codebase_search\` (hybrid), then ` +
    "`symbol_source`/`flow_trace` on the hits.\n" +
    `- Everything else (docs, configs, data — ${RAG_DOCUMENT_EXTENSIONS.slice(0, 5).join(" ")}, ` +
    "unknown extensions): `rag_search` with `collection: \"" + WORKSPACE_DOCS_COLLECTION + "\"`. " +
    "If it returns nothing for files you KNOW exist, ingest first — " +
    "`rag_ingest {collection: \"" + WORKSPACE_DOCS_COLLECTION + "\", sources: [\"/workspace/**/*.md\"]}` — " +
    "then search again. The code index cannot hold non-code files, so do not retry there."
  );
}
