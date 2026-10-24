---
id: shop-decision-20261002-retry-fixed-interval
type: decision
title: Outgoing payment calls are retried three times at a fixed one-second interval
project: shop
date: 2026-10-02
topic: payment-retry-policy
applies_when: the shop calls the payment provider over HTTP
rationale: transient timeouts of the provider failed one checkout in fifty
source: human:2026-10-02 plan approval SHOP-PLAN.md
status: superseded
supersedes: []
superseded_by: shop-decision-20261016-retry-exponential-backoff
tags: [resilience, http]
stack: [typescript]
---
## Context
The payment provider answered with transient timeouts during peak hours.

## Content
The old retry policy: three attempts, one second apart, on timeouts and 503 answers only.

## Evidence
`src/payment/infrastructure/provider-client.ts:40`
