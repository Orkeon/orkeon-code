// The declared model catalogue and what /model may say about it. Pure, no IO.
//
// `/model <name>` (B-10) hot-swaps the model for subsequent turns, and the swap
// travels over the SAME provider — so a name that provider does not serve is a
// 4xx on the next turn, one full turn later, with an error the operator has to
// go read in the log. The host now declares what it serves
// (`Llm:AvailableModels` → session metadata), so the mistake can be caught at
// the moment it is made.
//
// WARN, never refuse. The list is declarative: hand-written in a settings file,
// so it can lag behind the provider's catalogue. Refusing on it would block a
// model that works, which is a worse failure than the one being prevented — and
// silent for a different reason (the operator would think the model is gone).
// Same rule as `review.lenses`: an unrecognised entry is reported and the
// operation proceeds.

/** Nothing declared. Means UNKNOWN — never "no model is available". */
export const NO_DECLARED_MODELS: readonly string[] = [];

/** Normalise the metadata array: strings only, trimmed, blanks and dupes out. */
export function normalizeModelList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const name = String(entry ?? "").trim();
    if (name.length === 0) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Is `name` in the declared list? Case-insensitive, like the provider APIs. */
export function isDeclaredModel(models: readonly string[], name: unknown): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return n.length > 0 && models.some((m) => m.toLowerCase() === n);
}

export interface ModelChoiceVerdict {
  /** Always true: an undeclared model is still applied (see the header). */
  accepted: true;
  /** Non-empty when the name is outside a non-empty declared list. */
  warning: string;
}

/**
 * The verdict for `/model <name>`.
 *
 * No declared list ⇒ no warning: we know nothing, and inventing a doubt would
 * train the operator to ignore the message.
 */
export function judgeModelChoice(models: readonly string[], name: string): ModelChoiceVerdict {
  if (models.length === 0 || isDeclaredModel(models, name)) {
    return { accepted: true, warning: "" };
  }
  return {
    accepted: true,
    warning:
      `'${name}' is not among the models this host declares (${models.join(", ")}). ` +
      "Setting it anyway — the list comes from Llm:AvailableModels in the settings and may be " +
      "incomplete. If the provider does not serve it, the next turn fails with an API error.",
  };
}

/**
 * The catalogue as `/model list` shows it: declared order, the effective model
 * marked. Returns "" when nothing is declared so the caller can say why.
 */
export function renderModelList(
  models: readonly string[],
  effective: string,
): string {
  if (models.length === 0) return "";
  const active = effective.trim().toLowerCase();
  return models
    .map((m) => `  ${m.toLowerCase() === active ? "*" : " "} ${m}`)
    .join("\n");
}

/** Why the list is empty — the two cases an operator can act on. */
export const NO_CATALOGUE_NOTE =
  "no models declared. Add `\"AvailableModels\": [\"…\"]` to the `Llm` section of the settings " +
  "file (or Llm__AvailableModels=a,b in the environment) and /model can offer the choice.";
