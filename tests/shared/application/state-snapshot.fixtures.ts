// A session store holding a few state values, and the keys a snapshot takes of it.
import { FakeSessionStore } from "../../support/doubles/fake-session-store.ts";

/** The keys the snapshot reads in one call. */
export const KEYS = ["output_style", "fast_mode"];

/** A store whose state bag holds `output_style` and `config_map`, outside the snapshot. */
export function storeWithState(): FakeSessionStore {
  const store = new FakeSessionStore();
  store.state.set("output_style", "concise");
  store.state.set("config_map", "{}");
  return store;
}
