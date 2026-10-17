# Notice

Orkeon Code
Copyright (c) 2026 Orkeon Contributors. Licensed under the MIT License (see [LICENSE.md](LICENSE.md)).

Orkeon Code runs on the [Orkeon](https://github.com/Orkeon/orkeon) runtime (MIT), which is distributed separately
(the release archives, the `orkeon-runners` container image, the apt package, the .NET tools) with its own
third-party notices.

This repository ships TypeScript sources, and the Python sources of its speech MCP server (`mcp/whisper/`). Its
development dependencies (esbuild, MIT; TypeScript, Apache-2.0; `@types/node`, MIT) are not redistributed, nor are
the server's, which uv resolves on each machine: `mcp` (MIT), faster-whisper (MIT) and, as optional extras, openai
(Apache-2.0), sounddevice (MIT), NVIDIA's cuBLAS and cuDNN wheels (NVIDIA's own licence) and piper-tts (GPL-3.0),
which the server runs as a separate process and never imports. The 5-second sample `mcp/whisper/samples/fr-5s.wav`
is CC0 ([samples/README.md](mcp/whisper/samples/README.md)).

Orkeon Code is an independent project. Product names mentioned in its documentation belong to their owners.
