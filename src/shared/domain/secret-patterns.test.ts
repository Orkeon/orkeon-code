// Unit tests for the shared secret detection. Run:
//   node --test src/shared/domain/secret-patterns.test.ts
// The sample secrets are made-up and assembled from pieces, so no scanner reads them as real.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { SECRET_PATTERNS, secretLikePaths, secretPatternsIn } from "./secret-patterns.ts";

const join = (...parts: string[]): string => parts.join("");

describe("secretLikePaths", () => {
  it("flags env files, key and certificate stores, private keys and credentials files", () => {
    deepStrictEqual(
      secretLikePaths([".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12"]),
      [".env", "app/.env.production", "certs/server.pem", "deploy/id_rsa", "credentials.json", "keys/x.p12"],
    );
  });
  it("lets the examples, public keys and ordinary code through", () => {
    deepStrictEqual(secretLikePaths([".env.example", "id_rsa.pub", "src/secret-manager.ts", "src/keys.ts", "README.md"]), []);
  });
});

const cases: Array<{ name: string; hit: string; miss: string }> = [
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

describe("SECRET_PATTERNS", () => {
  it("names the nine patterns in their order", () => {
    deepStrictEqual(SECRET_PATTERNS.map((p) => p.name), cases.map((c) => c.name));
  });
  for (const c of cases) {
    it(`${c.name}: matches a sample and lets a near miss through`, () => {
      deepStrictEqual(secretPatternsIn(c.hit), [c.name]);
      deepStrictEqual(secretPatternsIn(c.miss), []);
    });
  }
  it("also matches the second GitHub token form", () => {
    deepStrictEqual(secretPatternsIn(join("github_pat_", "A1_".repeat(8))), ["GitHub token"]);
  });
});

describe("secretPatternsIn", () => {
  it("names each matching pattern once, in SECRET_PATTERNS order", () => {
    const text = join("token: ", "abcdefghij ", "AKIA", "ABCDEFGHIJKLMNOP ", "AKIA", "QRSTUVWXYZ012345");
    deepStrictEqual(secretPatternsIn(text), ["AWS access key id", "assigned secret"]);
  });
  it("is empty for ordinary prose", () => {
    strictEqual(secretPatternsIn("A use case reaches the store through its port.").length, 0);
  });
});
