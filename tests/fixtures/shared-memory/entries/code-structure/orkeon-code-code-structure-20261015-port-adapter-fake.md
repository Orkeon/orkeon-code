---
id: orkeon-code-code-structure-20261015-port-adapter-fake
type: code-structure
title: A runtime tool is reached through a port, an infrastructure adapter and a Fake in tests
project: orkeon-code
date: 2026-10-15
topic: runtime-tool-access
applies_when: TypeScript code running under Jint calls a runtime tool
rationale: use cases test in Node without the runtime globals
source: audit:workbench/sm/SM-VERIFY-F2.md
status: admitted
supersedes: []
tags: [clean-architecture, testing]
stack: [typescript, jint]
---
## Context
Use cases that called runtime tools directly could only be tested inside the runtime.

## Content
Each runtime tool is reached through a port interface in application/ports.ts. The adapter that calls the tool
lives in shared/infrastructure/orkeon/, and the test double of the port, a Fake, lives in tests/support/. Use cases
take their ports as parameters, so a Node test hands them the Fake.

## Evidence
`src/shared/application/ports.ts:1`, `src/shared/infrastructure/orkeon/wiring.ts:41`, `tests/support/fake-files.ts:1`
