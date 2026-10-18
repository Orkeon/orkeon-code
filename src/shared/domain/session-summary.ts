// The /summary request — pure. It runs through the main loop in plan mode, whose
// user body already carries the session's history: the request says what to make
// of it. Written from docs/architecture.md, "Crew prompts".

/** The request /summary sends to the main loop. */
export const SUMMARY_PROMPT =
  "Summarise this session for the user from the conversation so far, which is complete: calling a tool " +
  "would only spend this turn. Start with where things stand (done, in progress, blocked), then the " +
  "decisions taken, the files touched (each path and what changed) and what is still open, as a few short " +
  "bullets under each heading, leaving out a heading with nothing under it and adding no next-steps list " +
  "of your own. A [compacted] message stands for the turns before the last compaction: cover them too. " +
  "Report a test or a check only as it was last seen. Write in the language of the conversation.";
