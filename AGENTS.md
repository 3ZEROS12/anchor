# PI-ANCHOR AGENTS FIRMWARE

## 1. Package Metadata & Paths
- **Package**: `pi-anchor` | **Entry**: `dist/extension.js` (`src/extension.ts`)
- **Core Storage**: Exclusively `~/.anchor/` in user home (`state.json`, `archive.jsonl`, `graveyard.jsonl`).

## 2. Package Invariants
- **Zero Repo Pollution**: Never create, write, or stage `.anchor/` or task files inside active project repositories.
- **0 Idle-Token Steady State**: Inject anchors into context only on Turn 1 cold-start (`session_start`); subsequent turns consume 0 idle tokens unless referenced by files or keywords.
- **Atomic Storage & Dead-PID Lock Recovery**: All writes to `state.json` must use `acquireSyncLock` and `atomicRenameWithRetry` (write to `.tmp` + atomic rename); safely reclaim dead-PID lockfiles.
- **Two-Stage Settle Dialog**: Interactive TUI (`openAnchorDashboard`) must provide two-stage confirmation (`✓ Settle`, `ℹ View details`, `↩ Cancel`) with undo hints before completing tasks.
- **Pre-Flight Auto-Settle**: If an anchor declares `verifyCommand`, execute it on `session_start`; passing commands auto-settle the task immediately.
- **Exit Guard**: Prompt with uncommitted change warnings on the subsequent session startup following an uncommitted `quit`.

## 3. Verification Commands
- `npm test` (or `node ../.scripts/fleet.mjs test anchor`)
- `npm run build`
- `npm run typecheck`
