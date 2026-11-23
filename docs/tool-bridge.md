# The tool bridge: the browser of your machine for a session in Docker

In docker mode the agents run in a container, which has no Firefox and no screen. Orkeon's tool bridge (Orkeon #445)
runs chosen tools on your machine instead: `orkeon bridge serve` listens on your loopback, and the runtime in the
container sends it the calls of the tools its settings name. The tool keeps its name, its schema and its access
classes: the agent sees `firefox` as before, and the permission gate of the container judges each call as before
([Permissions](permissions.md)). This page sets both sides up for Orkeon Code. Orkeon's own guide,
[Orkeon in a container, the browser on the desktop](https://github.com/Orkeon/orkeon/blob/main/docs/guides/tool-bridge.md),
covers the protocol, the limits and https.

Tool and source modes need none of this: the runtime runs on your machine and drives its Firefox itself.

## What you need

- Both sides at the same Orkeon commit: the bridge refuses a tool whose contract differs. Orkeon `1.4.0`, the pin of
  `.orkeon-version`, carries the bridge:
  - in the container, the image of the last release, `ghcr.io/orkeon/orkeon:latest` (`docker pull` it if yours is
    older);
  - on your machine, the `orkeon` CLI of the same release (the `orkeon` Debian package, an Orkeon release archive or
    the `.msi`).
- Firefox on your machine.

When the pin runs ahead of the release, build both sides from an Orkeon checkout at the pin
(`git -C ~/src/orkeon checkout "$(cat .orkeon-version)"`, run from this checkout), then name the image with
`ORKEON_CODE_IMAGE=orkeon-local:pin` and serve with
`dotnet ~/src/orkeon/src/scripting/Orkeon.Scripting.Cli/bin/Debug/net10.0/orkeon.dll` in place of `orkeon`:

```bash
cd ~/src/orkeon
docker build -f Dockerfile.runners -t orkeon-local:pin .        # the image, as the release builds it
dotnet build src/scripting/Orkeon.Scripting.Cli -c Debug        # the CLI that serves the bridge
```

## 1. A token, on both sides

The token is never written in a file. Choose one of 16 characters or more and export it in the shell that starts the
bridge and in the one that starts Orkeon Code:

```bash
export ORKEON_BRIDGE_TOKEN="$(openssl rand -hex 32)"
```

`Orkeon:Tools:Bridge:TokenEnvVar` names another variable when this one does not suit you; the launcher reads that key
too.

## 2. The bridge, on your machine

In a folder of its own, an `appsettings.json` that serves `firefox`:

```json
{ "Orkeon": { "Bridge": { "Allow": ["firefox"] } } }
```

Then, from that folder:

```bash
orkeon bridge serve
```

```text
orkeon bridge serve: listening on http://127.0.0.1:7410/
orkeon bridge serve: serving firefox
orkeon bridge serve: Ctrl+C stops it.
```

Firefox runs with the bridge's settings: `Orkeon:Tools:Firefox` (`Headless`, the profiles) goes in this file, not in
Orkeon Code's. The calls an agent makes during its turn share one browser. A crew's code that calls `firefox` itself,
outside the model's turn, gets a fresh browser at each call (a `read` after `navigate` sees `about:blank`), unless
`"Lifetime": "Host"` keeps the browser open until `close`.

## 3. Orkeon Code, in the container

Merge [`config/appsettings.bridge.example.json`](../config/appsettings.bridge.example.json) into your settings:

```json
{ "Orkeon": { "Tools": { "Bridge": { "Address": "http://127.0.0.1:7410/", "Allow": ["firefox"] } } } }
```

Then start Orkeon Code in docker mode, with the token exported:

```bash
./orkeon-code --mode docker
```

When the settings name `Orkeon:Tools:Bridge:Address` and at least one tool in `Allow`, the launcher (both the REPL
and `orkeon-code run`):

- hands the container the token's variable by its name (`-e ORKEON_BRIDGE_TOKEN`), never its value;
- refuses to start when the variable is unset or shorter than 16 characters, and says which;
- runs the container on the host's network (`--network host`) when the address is on loopback (`localhost`, `127.x`,
  `[::1]`): the container's loopback is then your machine's, the one way a Linux engine reaches the bridge there.

The launcher reads the settings as plain JSON. The runtime also takes comments and trailing commas; the launcher
refuses such a file when it names a bridge, rather than start a container without its token.

At start the runtime logs `Tool bridge: Orkeon:Tools:Bridge selects firefox`. A bridge that cannot be reached stops
the start: `the tool bridge at http://127.0.0.1:7410/ cannot be reached (Connection refused …)`.

### Docker Desktop (Windows, macOS)

`host.docker.internal` reaches the bridge's loopback listener; the launcher then adds no `--network host`. The
listener answers only the host its prefix names. The runtime sends `127.0.0.1:7410` by itself, which suits macOS;
under Windows the listener's prefix is `http://localhost:7410/`, so set `HostHeader` to `localhost:7410`:

```json
{ "Orkeon": { "Tools": { "Bridge": { "Address": "http://host.docker.internal:7410/", "HostHeader": "localhost:7410", "Allow": ["firefox"] } } } }
```

Over http the token and the calls cross Docker's virtual network in clear, and the runtime warns at start.

## What was checked

On Linux with a Docker engine (29.10), an image and a CLI built from Orkeon `5dc2ff3`, the pin of that day:

- `orkeon-code run` with a crew that calls `firefox`: the page opens on the machine's Firefox, and the screenshot
  saved to `/output` reaches the session's output folder;
- the REPL in docker mode starts with the bridge and leaves on `/exit`;
- with the bridge stopped, the start is refused with the runtime's message; with no token, the launcher refuses before
  the container starts.

Not checked: Docker Desktop, Windows (`orkeon-code.ps1` is checked by its text only), and an https bridge.
