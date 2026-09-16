# MONSTRO

MONSTRO is an autonomous digital engineering workspace: understand intent, plan, build, run, inspect, test, repair, and deliver.

## V0 goal

A local-first engineering loop with four surfaces: Chat, Code, Live Preview, and Inspector.

Core loop:

`UNDERSTAND -> PLAN -> BUILD -> RUN -> EVALUATE -> REPAIR -> DELIVER`

## Principles

- Model-independent orchestration: reasoning, coding and vision providers are adapters.
- Project continuity: state, decisions, tasks and artifacts survive between turns.
- Execution over prose: a task is not complete because code was generated; it must run and pass acceptance checks.
- Sandboxed tools: generated code executes inside an isolated runtime with explicit capabilities.
- Evidence-first inspection: analyze resources that are public, user-owned, or explicitly authorized.
- Extensible specialists: web, backend, 3D, games, media, design, testing and security analysis plug into the same core.

## Repository layout

- `apps/web` - MONSTRO cockpit (Chat + Code + Preview + Inspector)
- `packages/core` - orchestrator and task state machine
- `packages/contracts` - shared types and schemas
- `packages/providers` - AI/provider adapter contracts
- `packages/policy` - capability policy and safety boundaries

## Development

Requires Node.js 20+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

This repository is at V0 foundation stage.