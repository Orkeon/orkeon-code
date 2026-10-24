---
id: orkeon-code-code-structure-20261017-search-routing-tree-vs-rag
type: code-structure
title: Code search goes to the code index, document search to the RAG collection
project: orkeon-code
date: 2026-10-17
topic: search-routing
applies_when: an agent searches a project that holds both source code and prose documents
rationale: the code index sees symbols only and the RAG sees prose only, so one query cannot serve both
source: verdict:workbench/search/SEARCH-VERIFY-F1.md
status: admitted
supersedes: []
tags: [search, rag]
stack: [typescript]
---
## Context
Questions about Markdown documents were sent to the code index, which never indexes them.

## Content
The search routing partitions the two: symbol and code questions go to the code index (the semantic tree),
documentation questions go to the workspace documents collection of the RAG. The routing rule is in the domain and
the prompt names it.

## Evidence
`src/shared/domain/search-routing.ts:1`
