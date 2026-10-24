---
id: orkeon-code-code-structure-20261019-runtime-globals-layer
type: code-structure
title: Only shared/infrastructure and the crew entry points may import runtime globals
project: orkeon-code
date: 2026-10-19
topic: runtime-globals-layer
applies_when: a file of src/ needs tools, rag, agentBuilder or crewBuilder
rationale: a domain or application file that reads a runtime global cannot run under Node tests
source: audit:workbench/arch/ARCH-VERIFY-F1.md
status: admitted
supersedes: []
tags: [clean-architecture, layering]
stack: [typescript, jint]
---
## Context
An application file read the tools global directly and its tests could not load it.

## Content
The architecture rule: only shared/infrastructure/ and the crew entry points (crew.ork.ts, probe.ork.ts) import
shared/infrastructure/globals.ts. Domain imports domain only; application never imports infrastructure. The
architecture test checks every import statically.

## Evidence
`tests/architecture.test.ts:1`, `src/shared/infrastructure/globals.ts:1`
