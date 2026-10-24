---
id: shop-decision-20261016-retry-exponential-backoff
type: decision
title: Payment calls retry with exponential backoff and jitter, capped at five attempts
project: shop
date: 2026-10-16
topic: payment-retry-policy
applies_when: the shop calls the payment provider over HTTP
rationale: fixed-interval retries synchronised the clients and prolonged the provider's outage
source: audit:workbench/payment/PAYMENT-VERIFY-F2.md
status: admitted
supersedes: [shop-decision-20261002-retry-fixed-interval]
tags: [resilience, http]
stack: [typescript]
---
## Context
During an incident the fixed one-second retries of every client hit the provider in waves and kept it down.

## Content
This replaces the old fixed-interval retry policy: retries now wait 200 ms, doubled at each attempt, with full
jitter, at most five attempts, and only for idempotent requests carrying an idempotency key.

## Evidence
`src/payment/infrastructure/retry-policy.ts:15`, `src/payment/infrastructure/provider-client.ts:44`
