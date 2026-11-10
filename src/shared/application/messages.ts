// The text the shared application services report to the user: unreadable settings, warnings, where a mode came from.

export const couldNotBeReadOrParsed = (path: string): string => `${path} could not be read or parsed`;
export const notJsonNoHostLayout = (path: string): string => `${path} is not JSON: no host layout applies`;
export const llmProfileRejected = (key: string, problem: string): string =>
  `${key}: ${problem}; the host's default model this launch`;
export const llmProfileUnreadable = (key: string, why: string): string =>
  `${key} could not be read (${why}): the host's default model this launch`;
export const SESSION_DEFAULT_VIA_MODE = "session default via /mode";

// Shared by several application folders
export const cannotBeRead = (path: string, reason: string): string => `${path} cannot be read (${reason})`;
export const prefixedCannotBeRead = (prefix: string, path: string, reason: string): string => `${prefix}: ${path} cannot be read (${reason})`;
export const couldNotRun = (command: string, reason: string): string => `${command} could not run: ${reason}`;
