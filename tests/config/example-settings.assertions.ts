// Checks on the example settings.
import assert from "node:assert/strict";

/** Every name of `expected` is among `examples`. */
export function assertExamplesInclude(examples: readonly string[], expected: readonly string[]): void {
  for (const name of expected) assert.ok(examples.includes(name), `${name} among ${examples.join(", ")}`);
}

/** The settings mount the folders their Whisper server reads at /audio and /transcripts, and start its script. */
export function assertWhisperMounts(settings: any): void {
  const mounts = settings.Orkeon.FileSystem.Mounts as string[];
  const env = settings.MCP.Servers.whisper.Env as Record<string, string>;
  assert.ok(mounts.includes(`${env.WHISPER_AUDIO_DIR}:/audio:ro`), mounts.join(", "));
  assert.ok(mounts.includes(`${env.WHISPER_OUT_DIR}:/transcripts:ro`), mounts.join(", "));
  const args = settings.MCP.Servers.whisper.Args as string[];
  assert.ok(args.at(-1)?.endsWith("/mcp/whisper/whisper_mcp.py"), args.join(" "));
  assert.equal(args[args.indexOf("--project") + 1] + "/whisper_mcp.py", args.at(-1));
}
