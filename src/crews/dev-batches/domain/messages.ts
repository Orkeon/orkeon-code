// The problems the domain of /dev-batches states: why a plan's batches have no order (ADR 0026).

// ── The order of the batches (wave-order.ts) ────────────────────────────────

export const selfDependency = (ids: string): string => `a batch depends on itself: ${ids}`;
export const dependencyCycle = (ids: string): string => `the dependencies form a cycle: ${ids}`;
