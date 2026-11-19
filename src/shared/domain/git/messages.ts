// The text of the git workflow shown to the user: the stop without an identity, the refusals of a pull
// request, the headings of its body.

export const noIdentityStop = (detail: string, rerun: string): string =>
  `✗ stopped: git has no identity for the commit (${detail}). Set one in a terminal, then re-run ${rerun}:`;
/** The two commands that give git an identity; the user types them with their own name and email. Docker mode copies
 *  the host's user.name and user.email into the container, so they serve there too once orkeon-code is relaunched. */
export const IDENTITY_HANDOVER: readonly string[] = [
  "git config --global user.name \"<your name>\"",
  "git config --global user.email <your email>",
];
/** Before the variables of IDENTITY_ENV_HANDOVER: the other way, the only one where git reads no ~/.gitconfig. */
export const IDENTITY_ENV_INTRO =
  "Or set these four variables before orkeon-code, the only way in a confined session with a HOME of its own, " +
  "where git reads no ~/.gitconfig; in a POSIX shell:";
/** The four variables git reads before any configuration file, which the runtime hands to a command (Orkeon #404). */
export const IDENTITY_ENV_HANDOVER: readonly string[] = [
  "export GIT_AUTHOR_NAME=\"<your name>\" GIT_COMMITTER_NAME=\"<your name>\"",
  "export GIT_AUTHOR_EMAIL=<your email> GIT_COMMITTER_EMAIL=<your email>",
];
/** Before the variables of IDENTITY_PS_HANDOVER: the same four in PowerShell (orkeon-code.ps1 forwards them). */
export const IDENTITY_PS_INTRO = "or in PowerShell:";
export const IDENTITY_PS_HANDOVER: readonly string[] = [
  "$env:GIT_AUTHOR_NAME = \"<your name>\"; $env:GIT_COMMITTER_NAME = \"<your name>\"",
  "$env:GIT_AUTHOR_EMAIL = \"<your email>\"; $env:GIT_COMMITTER_EMAIL = \"<your email>\"",
];

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
