#!/usr/bin/env node
// Render every LLM-facing prompt of Orkeon Code as the model reads it, to review a
// prompt change as a diff (docs/architecture.md, "Prompt assembly"; ADR 0003).
//
//   node scripts/render-prompts.mjs <dir>        e.g. temp/prompts/before, then temp/prompts/after
//   diff -r temp/prompts/before temp/prompts/after
//
// One file per prompt (NN-<name>.md: where it is built, where it is called, the
// sample inputs, then each section verbatim) and SIZES.md. The prompts come from
// tests/support/prompt-catalogue.ts, the catalogue tests/prompt-contract.test.ts
// checks; the Whisper server's tool descriptions are read from its source with
// Python's ast module (the file is parsed, never run), when python3 is there.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/render-prompts.mjs <dir>");
  process.exit(2);
}
const out = resolve(process.cwd(), target);
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });

const { renderCatalogue } = await import(pathToFileURL(join(root, "tests/support/prompt-catalogue.ts")).href);
const { CHARS_PER_TOKEN } = await import(pathToFileURL(join(root, "src/shared/domain/compaction-thresholds.ts")).href);
const prompts = await renderCatalogue();

const WHISPER_SCRIPT = [
  "import ast, sys",
  "tree = ast.parse(open(sys.argv[1], encoding='utf-8').read())",
  "for node in ast.walk(tree):",
  "    if isinstance(node, ast.Call) and getattr(node.func, 'id', '') == 'FastMCP':",
  "        for kw in node.keywords:",
  "            if kw.arg == 'instructions':",
  "                print('### server instructions'); print(ast.literal_eval(kw.value)); print()",
  "    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):",
  "        if any('tool' in ast.unparse(d) for d in node.decorator_list):",
  "            print('### tool ' + node.name); print(ast.get_docstring(node) or '(no docstring)'); print()",
].join("\n");
const whisper = spawnSync("python3", ["-I", "-c", WHISPER_SCRIPT, join(root, "mcp/whisper/whisper_mcp.py")], { encoding: "utf8" });
if (whisper.status === 0) {
  prompts.push({
    id: String(prompts.length + 1), name: "whisper-mcp-tools", source: "mcp/whisper/whisper_mcp.py",
    callSite: "the REPL connects the server; the assistant sees the tools tools.extra names",
    call: "MCP tool descriptions", inputs: "the server's source, parsed",
    sections: [{ title: "descriptions", role: "text", text: whisper.stdout.trim() }],
  });
}

const table = ["| id | prompt | section | characters | tokens (about) |", "|---|---|---|---|---|"];
for (const p of prompts) {
  const chars = p.sections.reduce((n, s) => n + s.text.length, 0);
  const head = [
    `# ${p.id} ${p.name}`,
    "",
    `- source: \`${p.source}\``,
    `- call site: ${p.callSite}`,
    `- call: ${p.call}`,
    `- sample inputs: ${p.inputs}`,
    `- size: ${chars} characters in ${p.sections.length} section(s), about ${Math.round(chars / CHARS_PER_TOKEN)} tokens`,
  ].join("\n");
  const body = p.sections
    .map((s) => `## ${s.title} (${s.role})\n\n${s.text.length} characters\n\n\`\`\`\`text\n${s.text}\n\`\`\`\``)
    .join("\n\n");
  writeFileSync(join(out, `${p.id}-${p.name}.md`), `${head}\n\n${body}\n`);
  for (const s of p.sections) table.push(`| ${p.id} | ${p.name} | ${s.title} | ${s.text.length} | ${Math.round(s.text.length / CHARS_PER_TOKEN)} |`);
}
writeFileSync(join(out, "SIZES.md"), `# Prompt sizes\n\n${table.join("\n")}\n`);
console.log(`${prompts.length} prompts rendered into ${out}`);
