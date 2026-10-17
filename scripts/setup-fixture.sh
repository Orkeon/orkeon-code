#!/usr/bin/env bash
# Seed the throwaway demo repository fixtures/sample-repo on demand: a few
# TypeScript sources and a git history, so /init, /assistant, /commit, /diff and
# /review have something to work on without pointing the agent at a real project.
# Nothing under fixtures/ is tracked: delete it any time, it comes back.
#
#   bash scripts/setup-fixture.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FX="$ROOT/fixtures/sample-repo"

seed_fixture_sources() {
  mkdir -p "$FX/src"
  cat > "$FX/package.json" <<'EOF'
{
  "name": "sample-repo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "eslint src"
  }
}
EOF
  cat > "$FX/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
EOF
  cat > "$FX/src/math.ts" <<'EOF'
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  return a / b;
}
EOF
  cat > "$FX/src/index.ts" <<'EOF'
import { add, multiply } from "./math.js";

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function sumAndScale(values: number[], factor: number): number {
  return multiply(values.reduce((acc, v) => add(acc, v), 0), factor);
}
EOF
  cat > "$FX/README.md" <<'EOF'
# sample-repo

Throwaway TypeScript fixture for the Orkeon Code demos (`/init`, `/assistant`, `/commit`, `/review`).
Regenerated on demand by `scripts/setup-fixture.sh`: do not put anything durable here.
EOF
}

if [ ! -f "$FX/package.json" ] || [ ! -f "$FX/src/index.ts" ]; then
  echo "seeding fixture sources: $FX"
  seed_fixture_sources
fi

if [ -d "$FX/.git" ]; then
  echo "fixture git already initialised: $FX/.git"
  exit 0
fi
git init -q "$FX"
git -C "$FX" config user.email "fixture@orkeon.local"
git -C "$FX" config user.name "Orkeon Code Fixture"
git -C "$FX" add -A
git -C "$FX" commit -q -m "chore: initial sample repo"
echo "fixture git initialised: $FX/.git"
git -C "$FX" log --oneline
