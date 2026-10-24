// Secret detection, pure: the file names that usually hold a secret (used by /commit
// before it stages anything) and the content patterns a stored text must never carry.

/** File names that usually hold a secret, and the safe variants of them. */
const SECRET_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"];
const SECRET_KEY_FILES = /^id_(rsa|dsa|ecdsa|ed25519)(\.|$)/;
const SAFE_ENV_SUFFIXES = [".example", ".sample", ".template", ".dist"];

/**
 * The paths that usually hold a secret: an env file (but not its example), a key
 * or certificate store, an SSH private key, a credentials file. Committing one by
 * accident is the one mistake `git add -A` makes easy and history keeps forever,
 * so /commit stops before any model call and lets the user decide.
 */
export function secretLikePaths(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const name = path.split("/").pop() ?? "";
    const lower = name.toLowerCase();
    if (lower === ".env" || (lower.startsWith(".env.") && !SAFE_ENV_SUFFIXES.some((s) => lower.endsWith(s)))) return true;
    if (SECRET_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
    if (SECRET_KEY_FILES.test(lower) && !lower.endsWith(".pub")) return true;
    return lower === "credentials" || lower === "credentials.json";
  });
}

export interface SecretPattern { name: string; re: RegExp }

/** Content patterns: a text that matches one is refused, and the match itself is never echoed. */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "private key block", re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  { name: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { name: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { name: "secret key", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "JSON web token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "credential in a URL", re: /:\/\/[^\/:@\s]+:[^\/:@\s]+@/ },
  { name: "assigned secret", re: /(?:api[_-]?key|secret|password|passwd|token)["']?\s*[:=]\s*["']?[^\s"']{8,}/i },
];

/** The names of the patterns the text matches, in SECRET_PATTERNS order, each once. */
export function secretPatternsIn(text: string): string[] {
  const value = String(text ?? "");
  return SECRET_PATTERNS.filter((pattern) => pattern.re.test(value)).map((pattern) => pattern.name);
}
