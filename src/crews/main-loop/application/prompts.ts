// The text the main-loop agent is built with: its role and goal.

// Freshness note: the loop deliberately has NO post-edit reindex step.
/** The role and goal of the main-loop agent. */
export const CODER_ROLE = "Interactive Coding Agent";
export const CODER_GOAL = "Understand a coding request, explore/edit/run code via tool-calling under permission, and answer.";

// Coordination lives host-side — file_write marks the path dirty (the store hook),
// shell edits are caught by the git working-tree probe, and the search tools
// reindex the union BEFORE answering (lazy, grouped, single-flight). Adding a loop
// step here would double the work and re-introduce the "agent must remember"
// failure mode the lazy design exists to remove.
