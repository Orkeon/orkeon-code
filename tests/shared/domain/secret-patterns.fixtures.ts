// Samples for the secret detection tests. The sample secrets are made-up and assembled from pieces, so no scanner
// reads them as real.

export const join = (...parts: string[]): string => parts.join("");

/** Paths of env files, key and certificate stores, private keys and credentials files. */
export const SECRET_PATHS: readonly string[] = [
  ".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12",
];

/** The examples, public keys and ordinary code. */
export const ORDINARY_PATHS: readonly string[] = [
  ".env.example", "id_rsa.pub", "src/secret-manager.ts", "src/keys.ts", "README.md",
];

/** Each pattern by name, in SECRET_PATTERNS order, with a sample it matches and a near miss it lets through. */
export const cases: Array<{ name: string; hit: string; miss: string }> = [
  { name: "private key block", hit: join("-----BEGIN ", "RSA PRIVATE KEY-----"), miss: "-----BEGIN PUBLIC KEY-----" },
  { name: "AWS access key id", hit: join("id AKIA", "ABCDEFGHIJKLMNOP end"), miss: "AKIA1234 is too short" },
  { name: "GitHub token", hit: join("ghp_", "a".repeat(36)), miss: join("ghp_", "a".repeat(20)) },
  { name: "Slack token", hit: join("xoxb-", "1234567890-abc"), miss: "xoxz-1234567890" },
  { name: "Google API key", hit: join("AIza", "B".repeat(35)), miss: join("AIza", "B".repeat(10)) },
  { name: "secret key", hit: join("sk-", "x".repeat(24)), miss: "the task-list is short" },
  {
    name: "JSON web token",
    hit: join("eyJ", "hbGciOiJIUzI1", ".", "eyJzdWIiOiIx", ".", "c2lnbmF0dXJl"),
    miss: "eyJ.short.one",
  },
  { name: "credential in a URL", hit: join("https://", "deploy:hunter22", "@example.org/x"), miss: "https://example.org/a:b@c" },
  { name: "assigned secret", hit: join("PASSWORD", " = 'correct-horse'"), miss: "the password field is required" },
];

/** An assigned secret and two AWS access key ids. */
export const TWO_PATTERNS_THREE_HITS = join("token: ", "abcdefghij ", "AKIA", "ABCDEFGHIJKLMNOP ", "AKIA", "QRSTUVWXYZ012345");
