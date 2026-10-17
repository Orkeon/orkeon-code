// Typed-memory categories — pure, no IO. The set the memory backend accepts
// (InMemoryCategoryMemoryStore), in the fixed order the prompt renders them; read
// by /memory, /export, the main-loop memory block and the compaction's memory
// extraction.

export const MEMORY_CATEGORIES = ["user", "project", "feedback", "reference"] as const;
