// The messages of shared/domain: the text the user reads (ADR 0026).

// ── Model failures ──────────────────────────────────────────────────────

/** The error a failed model call becomes. */
export const modelCallFailed = (detail: string): string => `the model call failed: ${detail}`;

/** Why a decision stage blocked a request, when it gave no reason but a risk. */
export const matchesTheRisk = (risk: string): string => `the request matches the risk '${risk}'`;

/** What the user reads for a blocked request: a decision, not an outage, and what to do about it. */
export const blockedByDecisionProfile = (profile: string, stage: string, why: string | null): string =>
  `Blocked by the decision profile '${profile}' (stage '${stage}')${why === null ? "" : `: ${why}`}. ` +
  "The model gave no answer; rephrase the request, or choose another profile with /config set llm.profile.";

/** What the error of an exhausted token budget says: the runtime's words, so a reader sees the dimension. */
export const BUDGET_EXHAUSTED_MESSAGE = "Token budget exhausted: the model made its last call without tools, and its answer is cut short";

// ── Code index ──────────────────────────────────────────────────────────

/** What the index cache did, in words. */
export const CACHE_HIT = "cache hit: the index an earlier session saved, no file changed";
export const cacheRefreshed = (reindexed: number): string => `cache refreshed: ${reindexed} changed file(s) reindexed`;
export const CACHE_MISS = "cache miss: built, then saved";
export const CACHE_BYPASSED = "cache bypassed: rebuilt, then saved";

// ── Config keys: what each one does and who reads it, as /config keys shows them ──

/** The words of a config key: what it does, and who reads it. */
export interface ConfigKeyDoc { description: string; consumedBy: string }

/** Who reads paths.deny and paths.allow. */
const PATH_LISTS_CONSUMERS =
  "/assistant, the dev steps and every other command that launches a crew (each act's calls), /permissions (the deny rules in the gate), /doctor";

export const PERMISSION_FALLBACK_DOC: ConfigKeyDoc = {
  description:
    "Permission mode for a session where neither /mode nor a 'mode:' prefix set one. " +
    "Omitted = 'default' (asks on writes, like the original).",
  consumedBy: "/assistant (main-loop crew), /commit, /mode, /permissions",
};

export const REVIEW_LENSES_DOC: ConfigKeyDoc = {
  description:
    "Comma-separated review lenses for /review (correctness, security, style). " +
    "Omitted = all three.",
  consumedBy: "/review (code-review crew)",
};

export const ADVISOR_MODEL_DOC: ConfigKeyDoc = {
  description:
    "Model used for the secondary opinion of /advisor. Omitted = the session's own " +
    "model, which makes the review a self-review and worth far less.",
  consumedBy: "/advisor (advisor crew)",
};

export const LLM_PROFILE_DOC: ConfigKeyDoc = {
  description:
    "The host profile the agents of every crew run on: an LLM profile (Llm:Profiles:<name>) or a decision " +
    "profile (Orkeon:Decision:Profiles:<name>, a decision model such as Jev in front of one), e.g. 'guarded'. " +
    "A name the host does not declare fails the crew's load, listing the profiles it knows. Omitted = the host's " +
    "default model.",
  consumedBy: "/assistant, /review, /commit, /advisor, /memory admit, the dev steps and every other command that launches a crew (the model its agents run on)",
};

export const COMMIT_REQUIRE_CONFIRM_DOC: ConfigKeyDoc = {
  description:
    "'false' lets /commit launch without a confirmation prompt. Omitted = 'true' " +
    "(a confirmation is required; see B-1).",
  consumedBy: "/commit",
};

export const SPINNER_VERBS_DOC: ConfigKeyDoc = {
  description:
    "Comma-separated verbs the TUI status line rotates through while a turn runs " +
    "(tweakcc vocabulary: 'thinking verbs'), e.g. 'Reticulating, Percolating'. " +
    "Omitted = the built-in Orkeon gerunds.",
  consumedBy: "the orkeon-repl TUI status line (read by the host)",
};

export const EXTRA_TOOLS_DOC: ConfigKeyDoc = {
  description:
    "Tools of an MCP server or a plugin the assistant may use, e.g. 'transcribe_audio:read, " +
    "search_issues': each <name>[:read|:write], write when the class is left out, so plan " +
    "and dontAsk offer only the read ones. A name the host does not register is left out " +
    "with a warning. Omitted = none.",
  consumedBy: "/assistant and /summary (the tools offered), /permissions (rules may name them)",
};

export const VOICE_REPLY_DOC: ConfigKeyDoc = {
  description:
    "'on' reads every answer of the assistant aloud, through the speech MCP server's speak " +
    "(the launcher's ORKEON_CODE_VOICE=1 opens the speaker); code blocks and tables are not read. " +
    "Omitted = 'off'.",
  consumedBy: "/assistant, /summary, /transcribe --then, /voice send and /voice --go (each answer read aloud)",
};

export const ANSWER_LANGUAGE_DOC: ConfigKeyDoc = {
  description:
    "The language the assistant answers in, e.g. 'French', unless the user writes in another one. " +
    "Omitted = the language of each request.",
  consumedBy: "/assistant, /summary, /transcribe --then, /voice send and /voice --go (the main loop's prompt)",
};

export const PRUNE_DOC: ConfigKeyDoc = {
  description:
    "'on' lets the host's decision model prune the tool loop of a turn: past 40 % of the context window, an older " +
    "result of a read tool that is no longer needed is removed or cut to its first 300 characters, with a note that says how " +
    "to get it back. Needs a decision provider on the host; without one nothing is pruned. Omitted = 'off'.",
  consumedBy: "/assistant, /summary, /transcribe --then, /voice send and /voice --go (the tool results of a turn in progress)",
};

export const ROUTE_AGENTS_DOC: ConfigKeyDoc = {
  description:
    "'on' lets the host's decision model pick, at each launch of a crew, the cheapest profile of route.ladder that " +
    "fits the command; never one above the session's llm.profile, and the floors of .orkeon/route-rules.json apply. " +
    "Needs a decision provider on the host; without one the session's profile stands. Omitted = 'off'.",
  consumedBy: "/route, and the commands that launch a crew routed by it (/dev-spec, /dev-change, /dev-plan, /dev-learn, /review, /analyze, /commit, /init, /init-verifiers)",
};

export const ROUTE_LADDER_DOC: ConfigKeyDoc = {
  description:
    "The host's LLM profiles the routing picks among, cheapest first, separated by commas. Omitted = 'small,large', " +
    "the two profiles of the example settings.",
  consumedBy: "/route, and the commands route.agents routes",
};

export const COMPACTION_TRIGGER_DOC: ConfigKeyDoc = {
  description:
    "The token count at which the automatic compaction runs, e.g. '90000' or '90k'. Omitted = the " +
    "context window minus the room one turn needs.",
  consumedBy: "/assistant (the automatic compaction at the head and the tail of a turn), /usage",
};

export const DEV_WORK_DIR_DOC: ConfigKeyDoc = {
  description:
    "The work folder of the dev workflow, relative to the checkout, e.g. 'backstage/tasks'. Omitted = the " +
    "repository pack's layout.work, else 'workbench'. A folder absent from the checkout falls back to 'workbench'.",
  consumedBy: "/dev-status (the work folder it reads), /commit (the work folder it leaves out)",
};

export const DEV_PR_AUTO_DOC: ConfigKeyDoc = {
  description:
    "'true' asks /commit to open the pull request of a pushed branch, as --pr does: through the github tool when " +
    "it is registered and the permission gate lets it, else the gh pr create command is printed. Omitted = 'false': " +
    "the command is printed. Set in the user settings; a project file may only narrow it to 'false'.",
  consumedBy: "/commit (the pull request of the branch)",
};

export const MEMORY_DIR_DOC: ConfigKeyDoc = {
  description:
    "The folder of the shared memory, relative to the project: its candidates, admitted entries and refused " +
    "topics. Omitted = '.orkeon/memory'. Never the agent memory's '.orkeon/agent-memory'.",
  consumedBy: "/memory-admit, /assistant (the memory_recall and memory_push tools)",
};

export const MEMORY_PROJECT_DOC: ConfigKeyDoc = {
  description:
    "The project name the shared memory's entries carry and its index is named after (memory-<project>), " +
    "e.g. 'orkeon-code'. Omitted = the name of the origin remote, else 'local'.",
  consumedBy: "/memory-admit, /assistant (the memory_recall and memory_push tools)",
};

export const MEMORY_AUTO_ADMIT_DOC: ConfigKeyDoc = {
  description:
    "'true' lets /memory-admit admit a candidate an audit verdict backs without asking. Omitted = 'false': " +
    "every candidate is confirmed. A project file may set it to 'true' only when the user settings do.",
  consumedBy: "/memory-admit",
};

export const PATHS_DENY_DOC: ConfigKeyDoc = {
  description:
    "Paths no tool of the model reads or writes, e.g. '/workspace/secrets, C:\\proj\\keys\\*, tests/fixtures/real': " +
    "entries separated by commas, each a path of a mount in any spelling the host knows or a path under /workspace, " +
    "'*' for any run of characters, a bare path covering what lies below it. Held on the canonical spelling, whatever " +
    "spelling a call uses. The project file's entries add to the user's. Omitted = none.",
  consumedBy: PATH_LISTS_CONSUMERS,
};

export const PATHS_ALLOW_DOC: ConfigKeyDoc = {
  description:
    "The only paths the tools of the model may reach, in the notation of paths.deny; a deny wins over it. " +
    "A project file may only narrow the user's list: an entry outside it is dropped. Omitted = every path of the mounts.",
  consumedBy: PATH_LISTS_CONSUMERS,
};

// ── Config keys: a project value set aside, a value refused ─────────────

export const PROJECT_FALLBACK_TOO_WIDE =
  "a project file may set only default, plan or acceptEdits; another mode comes from the " +
  "user settings (orkeonCode) or /mode";
export const widerThanUserFallback = (user: string): string =>
  `it is wider than the user settings' '${user}' (orkeonCode); a project file may only narrow it`;
export const EXTRA_TOOLS_NOT_ALLOWED = "the user settings do not allow (orkeonCode tools.extra, or *)";
export const AUTO_ADMIT_FROM_USER =
  "admitting without asking comes from the user settings (orkeonCode); a project file may only narrow it";
export const PR_AUTO_FROM_USER =
  "opening a pull request without asking comes from the user settings (orkeonCode); a project file may only narrow it";
export const PATHS_ALLOW_OUTSIDE_USER =
  "the user settings allow nothing there (orkeonCode paths.allow); a project file may only narrow it";

export const unknownConfigKey = (key: string, valid: readonly string[]): string =>
  `unknown config key '${key}'. Valid keys: ${valid.join(", ")}`;
export const needsAValue = (key: string): string => `'${key}' needs a value.`;
export const notAllowedValue = (value: string, key: string, allowed: readonly string[]): string =>
  `'${value}' is not valid for '${key}'. Allowed: ${allowed.join(", ")}`;
export const invalidValue = (value: string, key: string, problem: string): string =>
  `'${value}' is not valid for '${key}': ${problem}`;

// ── Saved agents ────────────────────────────────────────────────────────

export const invalidAgentName = (name: string): string =>
  `'${name}' is not a valid agent name (lowercase letters, digits and '-', starting with a letter)`;
export const agentNeedsRole = (name: string): string => `agent '${name}' needs a role`;
export const agentNeedsGoal = (name: string): string => `agent '${name}' needs a goal`;
export const DISCOVERED_IN_CREWS = "discovered in crews/ — read-only here";
export const shadowedByCrew = (role: string): string => `⚠ shadowed by the crew of the same name — never dispatched. ${role}`;

// ── Compaction outcome and trigger ──────────────────────────────────────

export const stateOfBatch = (path: string): string => `\nstate of the batch in progress: ${path}`;
export const noStateFileWrittenOnNewLine = (skipped: string): string => `\nno state file written: ${skipped}`;
export const BUFFER_TOO_SMALL_TO_COMPACT = "Buffer too small to compact.";
export const SNIPPED_INSTEAD = "\nThe buffer was snipped instead: the earlier turns were removed without a summary.";
export const A_TOKEN_COUNT = "a token count such as 90000 or 90k";

// ── The host layout (launch.json) ───────────────────────────────────────

export const LAUNCH_NOT_AN_OBJECT = "launch.json is not an object";
export const launchVersionIsNot = (version: string, expected: number | string): string =>
  `launch.json version ${version} is not ${expected}`;
export const launchFlavourIsNot = (flavour: string): string => `launch.json flavour '${flavour}' is not posix, wsl or windows`;
export const LAUNCH_MOUNTS_NOT_AN_OBJECT = "launch.json mounts is not an object";
export const notAMountPoint = (virtual: string): string => `launch.json mount '${virtual}' is not a mount point`;
export const mountHasNoBases = (virtual: string): string => `launch.json mount '${virtual}' has no bases`;
export const posixBaseNotAbsolute = (virtual: string, base: string): string =>
  `launch.json mount '${virtual}': posix base '${base}' is not an absolute path`;
export const windowsBaseNotADrive = (virtual: string, base: string): string =>
  `launch.json mount '${virtual}': windows base '${base}' is not a drive or UNC path`;
export const mountNoUsableBase = (virtual: string): string => `launch.json mount '${virtual}' has no usable base`;
export const wslWhere = (distro: string, root: string): string => `wsl (${distro}, drives under ${root})`;
export const noMountBase = (where: string): string => `${where}, no mount base: every path as the runtime spells it`;

// ── The LLM profile, the model catalogue ────────────────────────────────

export const PROFILE_NAME_EXPECTED = "a profile name is expected";
export const profileHoldsSpace = (value: string): string =>
  `'${value}' holds a space: a profile is one name, as the host's settings spell it`;
export const profileHoldsColon = (value: string): string => `'${value}' holds a colon: name the profile alone, not its settings path`;
export const modelNotDeclared = (name: string, models: string): string =>
  `'${name}' is not among the models this host declares (${models}). ` +
  "Setting it anyway — the list comes from Llm:AvailableModels in the settings and may be " +
  "incomplete. If the provider does not serve it, the next turn fails with an API error.";

/** Why the list is empty — the two cases an operator can act on. */
export const NO_CATALOGUE_NOTE =
  "no models declared. Add `\"AvailableModels\": [\"…\"]` to the `Llm` section of the settings " +
  "file (or Llm__AvailableModels=a,b in the environment) and /model can offer the choice.";

// ── The fallback permission mode ────────────────────────────────────────

export const builtInFallback = (mode: string, key: string): string =>
  `built-in default '${mode}' (asks on writes, like the original) — ` +
  `set '${key}' to change it`;
export const fallbackNotAMode = (key: string, raw: string, mode: string, modes: string): string =>
  `'${key}' is '${raw}', which is not a permission mode — ` +
  `IGNORED, running the built-in '${mode}'. ` +
  `Expected one of: ${modes}`;
export const SANDBOXED_POSTURE = " — sandboxed posture: the container/VFS is the security boundary, approvals never stall a session";

// ── Secret patterns, speech ─────────────────────────────────────────────

export const PRIVATE_KEY_BLOCK = "private key block";
export const AWS_ACCESS_KEY_ID = "AWS access key id";
export const REPLY_READ_ALOUD = "Reply read aloud";
