// The text the session commands show the user (ADR 0026): /resume, /tasks, /export, /copy, /rename and /rewind.

// /resume

/** What the listing says under the table. */
export const HOW_TO_RESUME =
  "`/resume <number or id>` brings one back in place of this session, which is archived; " +
  "`orkeon-code --resume <id>` does the same at start, `orkeon-code --continue` brings back the session you quit.";

/** What a host that does not persist the session leaves `/resume <n|id>` with. */
export const NO_SWITCH =
  "cannot switch in place: the REPL runs without a persisted session (Orkeon:Cli:Session:Persist off); " +
  "quit (/exit), then start `orkeon-code --resume <id>`.";

export const ambiguousSession = (choice: string): string =>
  `more than one saved session starts with '${choice}': give more of its id.`;
export const noSavedSession = (choice: string): string => `no saved session '${choice}' (/resume lists them).`;
export const sessionLoaded = (id: string, count: number, archive: string): string =>
  `loaded ${id} (${count} message(s)): the next turn continues it. ` +
  `The session you left is archived at ${archive}; the next start of orkeon-code moves it to the history.`;
export const loadFailed = (id: string, reason: string, archive: string): string =>
  `could not load ${id}: ${reason}. This session is unchanged${archive ? `; its archive ${archive} stays` : ""}.`;
export const historyNotMountedToLoad = (root: string): string =>
  `no saved session to load: ${root} is not mounted (start the REPL with orkeon-code).`;
export const NOTHING_TO_LOAD = "no saved session to load: this project has none yet.";
export const historyNotMountedToList = (root: string): string =>
  `no saved sessions to list: ${root} is not mounted (start the REPL with orkeon-code).`;
export const NO_SAVED_SESSIONS = "no saved session for this project yet: the next start of orkeon-code keeps this one.";
export const savedSessionsHeader = (count: number, more: number): string =>
  `${count} saved session(s) of this project, newest first${more > 0 ? ` (${more} more: orkeon-code --resume lists them all)` : ""}.`;
export const EMPTY_BUFFER = "this session's buffer is empty.";
export const bufferTail = (count: number, tail: readonly string[]): string =>
  `this session: ${count} message(s) in the buffer. Last turns:\n${tail.join("\n")}`;

// /tasks

export const TASKS_USAGE =
  "usage: /tasks [list | add <subject> | done <n> | clear | show <id> | stop <id> | send <id> <message> | repair <id> [note]]";

/** What to do with an approval listed: the answers the main prompt takes. */
export const ANSWER_TEXT = "answer it from the main prompt: [y] once / [s] session / [n] no";

export const waitsForApproval = (task: string, tool: string, input: string): string =>
  `${task}: waits for approval of ${tool} · ${input}`;
export const NO_TASKS = "no tasks and no agent instances. usage: /tasks add <subject>";
export const WAITING_FOR_APPROVAL = "waiting for approval:";
export const INSTANCE_VERBS = "/tasks show <id> · stop <id> · send <id> <message> · repair <id> [note]";
export const requestAlreadyWaiting = (ref: string, id: string): string =>
  `${ref}: a request the crew has not read yet is already waiting; /tasks show ${id} once it has`;
export const repairByNewRun = (ref: string, charter: string): string =>
  `${ref} has ended: a new run of ${charter} answers, with the previous report in its brief (not its live context).`;
export const TASKS_ADD_USAGE = "usage: /tasks add <subject>";
export const taskAdded = (n: number, subject: string): string => `task #${n} added: ${subject}`;
export const tasksDoneUsage = (max: number): string => `usage: /tasks done <1-${max}>`;
export const taskDone = (n: number, subject: string): string => `task #${n} done: ${subject}`;
export const tasksCleared = (count: number): string => `task list cleared (${count} removed).`;
export const stopAsked = (ref: string): string =>
  `stop asked for ${ref}: the crew ends it at its next look (about a second); /tasks shows it`;
export const TASKS_SEND_USAGE = "usage: /tasks send <id> <message>";
export const repairWhileRunning = (ref: string, id: string): string =>
  `${ref} is running: a repair is for an ended instance (/tasks stop ${id} first)`;

// /export

export const EMPTY_SESSION_BUFFER = "_(the session buffer is empty)_";
export const exported = (path: string, messages: number, memory: number): string =>
  `exported → ${path} (${messages} message(s), ${memory} memory entr(y/ies), cost included)`;

// /copy

export const LAST_OUTPUT_HEADER = "── last assistant output (full) ──";
export const alsoInFile = (path: string): string => ` It is also in ${path} (mounted volume).`;
export const copyNotWritten = (path: string, reason: string): string => `/copy could not write ${path}: ${reason}`;
export const selectToCopy = (written: string): string =>
  `(select in your terminal to copy — headless REPL has no OS clipboard)${written}`;
export const NO_ASSISTANT_OUTPUT = "no assistant output in the buffer yet.";

// /rename

export const RENAME_USAGE = "usage: /rename <title>";
export const renamed = (title: string): string => "renamed session to: " + title;

// /rewind

export const NOTHING_TO_REWIND = "nothing to rewind — no user turn in the buffer.";
export const rewound = (dropped: number, kept: number): string =>
  `rewound 1 exchange (${dropped} message(s) dropped, ${kept} kept).`;
