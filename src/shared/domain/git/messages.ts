// The text of the git workflow shown to the user: the stop without an identity, the refusals of a pull
// request, the headings of its body.

export const noIdentityStop = (detail: string, rerun: string): string =>
  `✗ stopped: git has no identity for the commit (${detail}). Set one in a terminal, then re-run ${rerun}:`;

// ── The body of a pull request ──────────────────────────────────────────

export const ASSUMPTIONS_BY_ID_HEAD = "| Id | Assumption | To be validated by |";
export const FILES_PER_LAYER_HEADING = "## Files, per layer";
export const ASSUMPTIONS_HEADING = "## Assumptions to validate";

// ── Why a pull request is not opened ────────────────────────────────────

export const modeDoesNotRun = (mode: string, tool: string): string => `mode '${mode}' does not run ${tool}`;
export const denyRuleCovers = (tool: string, action: string): string => `a deny rule of /permissions covers ${tool} ${action}`;
export const dontAskNeedsAllow = (tool: string): string => `mode 'dontAsk' runs ${tool} only under an allow rule`;
export const asksFirstNotAsked = (tool: string, mode: string, rule: string): string =>
  `${tool} asks first in mode '${mode}' and this run did not ask: ` +
  `'/permissions add ${rule}' lets it open the pull request`;
