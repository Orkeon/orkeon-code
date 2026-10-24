# cache — The symbol map is loaded on every call — refactor

## 1. What changes

The symbol map is read from disk each time a command asks for it. It is to be loaded
once per session and kept, with no change of what the commands print.

## 3. Acceptance

### CH-01 — The map is read once per session
- **Statement**: a second request for the map reads no file · **Proof**: a counting double

### CH-02 — A changed file reloads the map
- **Statement**: a request after the map file changed reads it again · **Proof**: the file's date in the double

## 4. What must not change

| Behaviour | Pinned by |
|-----------|-----------|
| the map holds the same symbols as before | `loads the cached map once` |
| an absent map file gives an empty map | unpinned |
| a malformed map file is reported, not thrown | unpinned |
