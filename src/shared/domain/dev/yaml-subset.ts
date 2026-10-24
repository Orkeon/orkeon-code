// A reader for the small block-style YAML a repository pack is written in. It gives the
// value PyYAML's safe_load gives on the same text, for the constructs it accepts, and
// refuses everything else with the first offending line: a wrong value is worse than a
// stop. Accepted: block maps and sequences at any depth, one-line flow sequences of
// scalars, single- and double-quoted scalars on one line, plain scalars on one line,
// comments, the folded block `>-`, and the YAML 1.1 scalar types (null, boolean,
// decimal integer, float). Pure: no runtime global, never throws.

export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | YamlValue[] | YamlMap;
export interface YamlMap { [key: string]: YamlValue }
export interface YamlError { line: number; message: string }
export type YamlParse = { ok: true; value: YamlValue } | { ok: false; error: YamlError };

/** `<path>:<line>: <message>` */
export function formatYamlError(path: string, error: YamlError): string {
  return `${path}:${error.line}: ${error.message}`;
}

const MSG = {
  tab: "a tab in the indentation",
  tabInLine: "a tab outside quotes and comments",
  marker: "a document marker is not supported",
  anchor: "anchors, aliases and tags are not supported",
  flowMap: "a flow mapping is not supported",
  flowOpen: "a flow sequence must close on its line",
  flowNested: "a nested flow sequence is not supported",
  flowAfter: "text after a closing bracket",
  flowEmpty: "an empty item in a flow sequence",
  moreIndented: "a more-indented line inside a folded block is not supported",
  quoteOpen: "a quoted scalar must close on its line",
  quoteAfter: "text after a closing quote",
  colon: "': ' inside a plain value: quote it",
  key: "a mapping key must be a plain name",
  indent: "bad indentation (a value continued on the next line is not supported)",
  itemForKey: "a sequence item where a mapping key was expected",
  keyForItem: "a mapping key where a sequence item was expected",
  nestedItem: "a nested sequence item on one line is not supported",
} as const;

class YamlStop {
  readonly line: number;
  readonly message: string;
  constructor(line: number, message: string) {
    this.line = line;
    this.message = message;
  }
}

interface Line { no: number; indent: number; text: string }

const KEY_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const NULLS = new Set(["~", "null", "Null", "NULL", ""]);
const TRUES = new Set(["true", "True", "TRUE", "yes", "Yes", "YES", "on", "On", "ON"]);
const FALSES = new Set(["false", "False", "FALSE", "no", "No", "NO", "off", "Off", "OFF"]);
const DECIMAL = /^[-+]?(0|[1-9][0-9_]*)$/;
const FLOAT = /^(?:[-+]?[0-9][0-9_]*\.[0-9_]*(?:[eE][-+][0-9]+)?|[-+]?\.[0-9_]+(?:[eE][-+][0-9]+)?)$/;
const INF = /^[-+]?\.(?:inf|Inf|INF)$/;
const NAN = /^\.(?:nan|NaN|NAN)$/;
const AMBIGUOUS = [
  /^[-+]?0[0-7_]+$/, // octal
  /^[-+]?0x[0-9a-fA-F_]+$/, // hexadecimal
  /^[-+]?0o[0-7_]+$/, // YAML 1.2 octal
  /^[-+]?0b[01_]+$/, // binary
  /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+(?:\.[0-9_]*)?$/, // sexagesimal
];
// PyYAML reads these as a date or a datetime, which JSON has no form for.
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$|^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}/;

/** The type PyYAML's resolver gives a plain scalar, or a stop for a form it reads otherwise. */
function typePlain(v: string, no: number): YamlScalar {
  if (NULLS.has(v)) return null;
  if (TRUES.has(v)) return true;
  if (FALSES.has(v)) return false;
  if (DECIMAL.test(v)) return Number(v.replace(/_/g, "")) || 0;
  if (FLOAT.test(v)) return Number(v.replace(/_/g, "")) || 0;
  if (INF.test(v)) return v.startsWith("-") ? -Infinity : Infinity;
  if (NAN.test(v)) return Number.NaN;
  if (AMBIGUOUS.some((re) => re.test(v))) throw new YamlStop(no, `an ambiguous number '${v}': quote it`);
  if (DATE.test(v)) throw new YamlStop(no, `an ambiguous date '${v}': quote it`);
  return v;
}

/** Whether what follows a closing quote or bracket is only blanks or a ` # comment`. */
function onlyComment(rest: string): boolean {
  return rest.trim() === "" || /^\s+#/.test(rest);
}

/** Reads a quoted scalar opening at text[0]; returns its value and the index after the closing quote. */
function readQuoted(text: string, no: number): { value: string; end: number } {
  const q = text[0];
  let out = "";
  let i = 1;
  while (i < text.length) {
    const c = text[i];
    if (q === "'") {
      if (c === "'") {
        if (text[i + 1] === "'") { out += "'"; i += 2; continue; }
        return { value: out, end: i + 1 };
      }
    } else {
      if (c === "\\") {
        const e = text[i + 1];
        const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t" };
        if (e === undefined || !(e in map)) {
          throw new YamlStop(no, `an unknown escape '\\${e ?? ""}' in a double-quoted scalar`);
        }
        out += map[e];
        i += 2;
        continue;
      }
      if (c === '"') return { value: out, end: i + 1 };
    }
    out += c;
    i++;
  }
  throw new YamlStop(no, MSG.quoteOpen);
}

/**
 * Stops on a tab that sits outside a quoted scalar and before any comment: PyYAML's
 * scanner refuses one there, in the separator after `:` or `-` as inside a plain value.
 * A quote opens a scalar only at the start or after a blank, `[` or `,`.
 */
function refuseTabs(text: string, no: number): void {
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = i === 0 ? " " : text[i - 1];
    if (quote === "'") {
      if (c === "'") { if (text[i + 1] === "'") i++; else quote = ""; }
      continue;
    }
    if (quote === '"') {
      if (c === "\\") i++;
      else if (c === '"') quote = "";
      continue;
    }
    if (c === "\t") throw new YamlStop(no, MSG.tabInLine);
    if (c === "#" && prev === " ") return;
    if ((c === "'" || c === '"') && (prev === " " || prev === "[" || prev === ",")) quote = c;
  }
}

// PyYAML refuses a plain scalar opening with one of these (the indicators it reserves).
const RESERVED_START = /^(?:[%@`|>]|\?(?:\s|$))/;

function plainScalar(raw: string, no: number): YamlScalar {
  const cut = raw.search(/\s#/);
  const v = (cut < 0 ? raw : raw.slice(0, cut)).trimEnd();
  if (RESERVED_START.test(v)) throw new YamlStop(no, `a plain value cannot start with '${v[0]}': quote it`);
  if (/:(\s|$)/.test(v)) throw new YamlStop(no, MSG.colon);
  return typePlain(v, no);
}

function flowSequence(text: string, no: number): YamlValue[] {
  const items: string[] = [];
  const quoted: boolean[] = [];
  let cur = "";
  let curQuoted = false;
  let i = 1;
  for (;;) {
    if (i >= text.length) throw new YamlStop(no, MSG.flowOpen);
    const c = text[i];
    if (c === "[") throw new YamlStop(no, MSG.flowNested);
    if (c === "{") throw new YamlStop(no, MSG.flowMap);
    if ((c === '"' || c === "'") && cur.trim() === "") {
      const q = readQuoted(text.slice(i), no);
      cur = q.value;
      curQuoted = true;
      i += q.end;
      const after = /^\s*/.exec(text.slice(i));
      i += after ? after[0].length : 0;
      if (text[i] !== "," && text[i] !== "]") {
        if (i >= text.length) throw new YamlStop(no, MSG.flowOpen);
        throw new YamlStop(no, MSG.quoteAfter);
      }
      continue;
    }
    if (c === "," || c === "]") {
      items.push(curQuoted ? cur : cur.trim());
      quoted.push(curQuoted);
      cur = "";
      curQuoted = false;
      i++;
      if (c === "]") break;
      continue;
    }
    cur += c;
    i++;
  }
  if (!onlyComment(text.slice(i))) throw new YamlStop(no, MSG.flowAfter);
  // `[]` and a trailing comma leave one empty, unquoted last item: PyYAML drops it.
  const last = items.length - 1;
  if (last >= 0 && !quoted[last] && items[last] === "") { items.pop(); quoted.pop(); }
  return items.map((item, k) => {
    if (quoted[k]) return item;
    if (item === "") throw new YamlStop(no, MSG.flowEmpty);
    if (/^[&*!]/.test(item)) throw new YamlStop(no, MSG.anchor);
    return plainScalar(item, no);
  });
}

/** A value written on the line of its key or dash (never empty, never a block indicator). */
function inlineValue(text: string, no: number): YamlValue {
  const c = text[0];
  if (c === "&" || c === "*" || c === "!") throw new YamlStop(no, MSG.anchor);
  if (c === "{") throw new YamlStop(no, MSG.flowMap);
  if (c === "[") return flowSequence(text, no);
  if (c === '"' || c === "'") {
    const q = readQuoted(text, no);
    if (!onlyComment(text.slice(q.end))) throw new YamlStop(no, MSG.quoteAfter);
    return q.value;
  }
  if (/^-(\s|$)/.test(text)) throw new YamlStop(no, MSG.nestedItem);
  return plainScalar(text, no);
}

const isItem = (text: string): boolean => /^-(\s|$)/.test(text);
const isComment = (text: string): boolean => text.startsWith("#");

/** The key of a `key: value` line and the text after `:`, or null when the line is not one. */
function splitKey(text: string, no: number): { key: string; rest: string } | null {
  if (text[0] === "[" || text[0] === "{") return null;
  if (text.startsWith("? ") || text === "?") throw new YamlStop(no, MSG.key);
  if (text[0] === '"' || text[0] === "'") {
    let end: number;
    try { end = readQuoted(text, no).end; } catch { return null; }
    if (/^\s*:(\s|$)/.test(text.slice(end))) throw new YamlStop(no, MSG.key);
    return null;
  }
  const cut = text.search(/\s#/);
  const head = cut < 0 ? text : text.slice(0, cut);
  const m = /:(\s|$)/.exec(head);
  if (!m) return null;
  const key = head.slice(0, m.index);
  if (!KEY_NAME.test(key) || typeof typePlain(key, no) !== "string") throw new YamlStop(no, MSG.key);
  return { key, rest: text.slice(m.index + 1).trim() };
}

function blockIndicator(rest: string): string | null {
  const m = /^([|>][0-9+-]*)(\s+#.*)?$/.exec(rest);
  return m ? m[1] : null;
}

class Parser {
  private readonly raw: string[];
  private readonly lines: Line[] = [];
  private readonly rawIndex: number[] = [];
  private pos = 0;

  constructor(text: string) {
    this.raw = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  }

  run(): YamlValue {
    this.raw.forEach((r, k) => {
      const lead = /^[ \t]*/.exec(r)?.[0] ?? "";
      const text = r.slice(lead.length);
      if (/^(---|\.\.\.)(\s|$)/.test(r)) throw new YamlStop(k + 1, MSG.marker);
      if (text === "" || isComment(text)) return;
      if (lead.includes("\t")) throw new YamlStop(k + 1, MSG.tab);
      this.lines.push({ no: k + 1, indent: lead.length, text: text.trimEnd() });
      this.rawIndex.push(k);
    });
    if (this.lines.length === 0) return null;
    const first = this.lines[0];
    refuseTabs(first.text, first.no);
    let value: YamlValue;
    if (isItem(first.text) || splitKey(first.text, first.no)) value = this.block(first.indent, false);
    else {
      value = this.scalarOrFolded(first.text, -1, first.no);
      this.pos = Math.max(this.pos, 1);
    }
    const next = this.peek();
    if (next) throw new YamlStop(next.no, MSG.indent);
    return value;
  }

  private peek(): Line | undefined {
    return this.lines[this.pos];
  }

  private block(indent: number, underKey: boolean): YamlValue {
    const line = this.peek() as Line;
    return isItem(line.text) ? this.sequence(indent, underKey) : this.mapping(indent);
  }

  private mapping(indent: number): YamlMap {
    const out: YamlMap = {};
    for (let line = this.peek(); line && line.indent >= indent; line = this.peek()) {
      if (line.indent > indent) throw new YamlStop(line.no, MSG.indent);
      refuseTabs(line.text, line.no);
      if (isItem(line.text)) throw new YamlStop(line.no, MSG.itemForKey);
      const kv = splitKey(line.text, line.no);
      if (!kv) throw new YamlStop(line.no, MSG.indent);
      if (Object.hasOwn(out, kv.key)) throw new YamlStop(line.no, `a duplicate key '${kv.key}'`);
      this.pos++;
      const value = this.valueAfter(kv.rest, indent, line.no, true);
      Object.defineProperty(out, kv.key, { value, enumerable: true, writable: true, configurable: true });
    }
    return out;
  }

  private sequence(indent: number, underKey: boolean): YamlValue[] {
    const out: YamlValue[] = [];
    for (let line = this.peek(); line && line.indent >= indent; line = this.peek()) {
      if (line.indent > indent) throw new YamlStop(line.no, MSG.indent);
      if (!isItem(line.text)) {
        if (underKey) break;
        throw new YamlStop(line.no, MSG.keyForItem);
      }
      refuseTabs(line.text, line.no);
      const rest = line.text.slice(1).replace(/^\s+/, "");
      if (rest === "" || isComment(rest)) {
        this.pos++;
        out.push(this.valueAfter("", indent, line.no, false));
        continue;
      }
      if (isItem(rest)) throw new YamlStop(line.no, MSG.nestedItem);
      if (splitKey(rest, line.no)) {
        // `- key: value` opens a map whose keys align on the column after the dash.
        const col = line.indent + (line.text.length - rest.length);
        this.lines[this.pos] = { no: line.no, indent: col, text: rest };
        out.push(this.mapping(col));
        continue;
      }
      this.pos++;
      out.push(this.scalarOrFolded(rest, indent, line.no));
    }
    return out;
  }

  /** The value after `key:` (or a bare dash): inline, folded, or the block on the next lines. */
  private valueAfter(rest: string, indent: number, no: number, isKey: boolean): YamlValue {
    if (rest !== "" && !isComment(rest)) return this.scalarOrFolded(rest, indent, no);
    const next = this.peek();
    if (next && next.indent > indent) return this.block(next.indent, false);
    if (isKey && next && next.indent === indent && isItem(next.text)) return this.block(indent, true);
    return null;
  }

  private scalarOrFolded(rest: string, parentIndent: number, no: number): YamlValue {
    const indicator = blockIndicator(rest);
    if (indicator !== null) {
      if (indicator !== ">-") {
        throw new YamlStop(no, `only the folded block '>-' is supported, not '${indicator}'`);
      }
      return this.folded(parentIndent, no);
    }
    const value = inlineValue(rest, no);
    const next = this.peek();
    if (next && next.indent > parentIndent && next.no > no) throw new YamlStop(next.no, MSG.indent);
    return value;
  }

  /** A `>-` block: the raw lines after the header that are deeper than the parent. */
  private folded(parentIndent: number, headerNo: number): string {
    let k = headerNo; // 0-based index of the first raw line after the header
    let contentIndent = -1;
    const parts: Array<string | null> = []; // null = a blank line
    for (; k < this.raw.length; k++) {
      const r = this.raw[k];
      if (r.trim() === "") { parts.push(null); continue; }
      const lead = (/^[ \t]*/.exec(r)?.[0] ?? "");
      if (lead.includes("\t")) throw new YamlStop(k + 1, MSG.tab);
      const ind = lead.length;
      if (ind <= parentIndent) break;
      if (contentIndent < 0) contentIndent = ind;
      if (ind > contentIndent) throw new YamlStop(k + 1, MSG.moreIndented);
      if (ind < contentIndent) {
        // A comment line shallower than the content but deeper than the parent ends the block.
        if (r.slice(ind).startsWith("#")) break;
        throw new YamlStop(k + 1, MSG.indent);
      }
      parts.push(r.slice(ind));
    }
    while (this.pos < this.lines.length && this.rawIndex[this.pos] < k) this.pos++;
    while (parts.length > 0 && parts[parts.length - 1] === null) parts.pop();
    let out = "";
    let prevText = false;
    let breaks = 0;
    for (const p of parts) {
      if (p === null) { breaks++; continue; }
      if (prevText) out += breaks > 0 ? "\n".repeat(breaks) : " ";
      else out += "\n".repeat(breaks);
      out += p;
      prevText = true;
      breaks = 0;
    }
    return out;
  }
}

export function parseYamlSubset(text: string): YamlParse {
  try {
    return { ok: true, value: new Parser(text).run() };
  } catch (e) {
    if (e instanceof YamlStop) return { ok: false, error: { line: e.line, message: e.message } };
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { line: 1, message } };
  }
}
