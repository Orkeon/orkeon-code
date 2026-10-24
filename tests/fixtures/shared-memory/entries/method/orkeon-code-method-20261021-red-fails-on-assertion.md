---
id: orkeon-code-method-20261021-red-fails-on-assertion
type: method
title: A red test must fail on its assertion, never on a missing import or a crash
project: orkeon-code
date: 2026-10-21
topic: red-before-green
applies_when: a test is written before the production code it checks
rationale: tests that were red only because a module was missing turned green without checking anything
source: audit:workbench/tdd/TDD-VERIFY-F3.md
status: admitted
supersedes: []
tags: [testing, tdd]
stack: [typescript]
---
## Context
Several red tests failed with a module-not-found error, then passed as soon as an empty stub existed.

## Content
RED before GREEN: write the signature stub first so the test loads, run it, and read the failure. The red test
fails on its assertion (expected versus actual), not on an import, a type error or an exception. Only then write
the production code.

## Evidence
`workbench/tdd/TDD-VERIFY-F3.md:20`
