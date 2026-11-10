// The text the Orkeon adapters show the user: the errors they throw.

export const notOneOfOurTools = (name: string): string => `'${name}' is not one of Orkeon Code's tools (SCRIPT_TOOLS)`;
export const CHILD_INPUT_NOT_A_CALL = "child agent: its input is not a child call";
export const GITHUB_FAILED_WITHOUT_REASON = "the github tool reported a failure without a reason";
export const GITHUB_SUCCESS_WITHOUT_PULL_REQUEST = "the github tool answered success without the pull request";
export const noLlmNamespace = (name: string): string =>
  `llm.profile '${name}': this host declares no llm namespace, no profile can be applied`;
export const sessionStoreRefusedAppend = (role: string): string => `session_store refused to append a '${role}' message`;
export const SHELL_JOB_NEEDS_COMMAND = "a shell job needs a command";
export const noJobIdFor = (command: string): string => `start_job answered no job id for: ${command}`;
export const waitNotWholeSeconds = (seconds: number): string => `a wait is a whole number of seconds, at least 1: ${seconds}`;
export const timeoutNotWholeSeconds = (timeout: number): string =>
  `a shell timeout is a whole number of seconds, at least 1: ${timeout}`;
export const noRegisteredTool = (name: string): string => `no registered tool '${name}'`;
