# SYSTEM CONTEXT & OPERATIONAL PROFILE: PI-ANCHOR

## 1. Domain & Runtime Environment (RFC 2119)
- **Package / Target**: `pi-anchor` (v0.2.0)
- **Primary Domain**: Zero-pollution, 0-idle-token cross-session task memory for AI coding agents.
- **Runtime & Toolchain**: Node.js v20+ / TypeScript Strict / tsup (dual ESM+CJS) / native `node:test`.
- **Extension Entry**: `dist/extension.js` (authored in `src/extension.ts`).
- **Core Storage Path**: `~/.anchor/` in the user's home directory. Zero repo pollution (never create `.anchor/` in project git repositories).

---

## 2. Core Operational Invariants (RFC 2119)

### Invariant 1: Zero Repository Pollution
- Data MUST reside exclusively in `~/.anchor/state.json`, `~/.anchor/archive.jsonl`, and `~/.anchor/graveyard.jsonl`.
- Modifying, committing, or generating task files inside the active project's git working tree is STRICTLY FORBIDDEN.

### Invariant 2: 0 Idle-Token Steady State
- Anchors MUST be injected into the LLM context exclusively on Turn 1 of a cold-start session (`session_start`).
- Subsequent conversational turns MUST consume 0 idle tokens unless explicitly referenced by files or task keywords.

### Invariant 3: Atomic Storage & Dead-PID Lock Recovery
- File writes to `state.json` MUST use `acquireSyncLock` and `atomicRenameWithRetry` (write to `.tmp` + atomic rename) to eliminate Windows `EBUSY` and partial JSON write tearing.
- Stale lockfiles from terminated process IDs MUST be safely reclaimed.

### Invariant 4: Accidental Settle Guard & TUI Truncation
- The interactive TUI (`openAnchorDashboard`) MUST provide a two-stage dialog (`✓ Settle`, `ℹ View details`, `↩ Cancel`) with undo hints to prevent accidental task completion upon pressing Enter.
- Visual string truncation (`truncateToWidth`) MUST strip trailing open brackets (`(`, `[`, `{`, `（`, `【`) right before ellipsis markers to eliminate dangling open states.

---

## 3. Physical Verification & Build Commands

- **Run Physical Test Suite**:
  ```bash
  npm test
  # or from workspace root: node .scripts/fleet.mjs test anchor
  ```
- **Build Distribution Bundles**:
  ```bash
  npm run build
  # compiles dist/extension.js, dist/index.js, dist/*.cjs, and .d.ts files
  ```
- **Run Strict Type Check**:
  ```bash
  npm run typecheck
  ```

---

## 4. Architectural Boundaries & Quality Gates

- **Pre-Flight Execution**: When an anchor declares `verifyCommand`, the runner MUST physically execute it on session start. Tasks that pass MUST auto-settle immediately.
- **Exit Guard**: Uncommitted changes upon session termination (`quit`) MUST trigger an exit reminder prompt on the next startup.
- **Test Integrity**: Test badges in `README.md` and `README_zh.md` MUST anchor 1:1 to physical test counts (26/26 passed, 100% green).
